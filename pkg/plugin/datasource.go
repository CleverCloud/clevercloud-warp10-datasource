package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	b "github.com/miton18/go-warp10/base"
	"github.com/tidwall/gjson"
	_ "github.com/tidwall/gjson"
	"sync"
	"time"
)

// Make sure Datasource implements required interfaces. This is important to do
// since otherwise we will only get a not implemented error response from plugin in
// runtime. In this example datasource instance implements backend.QueryDataHandler,
// backend.CheckHealthHandler interfaces. Plugin should not implement all these
// interfaces - only those which are required for a particular task.
var (
	_ backend.QueryDataHandler      = (*Datasource)(nil)
	_ backend.CheckHealthHandler    = (*Datasource)(nil)
	_ instancemgmt.InstanceDisposer = (*Datasource)(nil)
)

// NewDatasource creates a new datasource instance.
func NewDatasource(ds backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {

	logger := log.New()

	var jsonData WarpDataSourceOptions

	if err := json.Unmarshal(ds.JSONData, &jsonData); err != nil {
		logger.Error("Unmarshall json data error")
	}

	var client *b.Client = b.NewClient(jsonData.Path)

	return &Datasource{client}, nil
}

// Datasource is an datasource which can respond to data queries, reports
// its health and has streaming skills.
type Datasource struct {
	client *b.Client
}

// Dispose here tells plugin SDK that plugin wants to clean up resources when a new instance
// created. As soon as datasource settings change detected by SDK old datasource instance will
// be disposed and a new one will be created using NewSampleDatasource factory function.
func (d *Datasource) Dispose() {
	// Clean up datasource instance resources.
	d.client = nil
}

// QueryData handles multiple queries and returns multiple responses.
// req contains the queries []DataQuery (where each query contains RefID as a unique identifier).
// The QueryDataResponse contains a map of RefID to the response for each query, and each response
// contains Frames ([]*Frame).
func (d *Datasource) QueryData(ctx context.Context, req *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {
	// create response struct
	response := backend.NewQueryDataResponse()

	// Use WaitGroup to handle parallel execution
	var wg sync.WaitGroup
	var mu sync.Mutex

	// loop over queries and execute them individually.
	for _, q := range req.Queries {
		wg.Add(1)

		go func(query backend.DataQuery) {
			defer wg.Done()

			res := d.query(ctx, req.PluginContext, query)

			// Safely update the response map
			// based on with RefID as identifier
			mu.Lock()
			response.Responses[query.RefID] = res
			mu.Unlock()
		}(q)
	}

	wg.Wait()

	return response, nil
}

func (d *Datasource) query(_ context.Context, pCtx backend.PluginContext, query backend.DataQuery) backend.DataResponse {
	logger := log.New()

	// Recup warpscript text
	var wsQuery WSQuery
	if err := json.Unmarshal(query.JSON, &wsQuery); err != nil {
		var errStr = fmt.Sprintf("json unmarshal: %v", err.Error())
		logger.Error(errStr)
		return backend.ErrDataResponse(backend.StatusBadRequest, errStr)
	}

	// Exec query
	body, err := d.client.Exec(wsQuery.Expr)
	if err != nil {
		var errStr = fmt.Sprintf("client exec: %v", err.Error())
		logger.Error(errStr)
		return backend.ErrDataResponse(backend.StatusInternal, errStr)
	}

	/*
		Supported reponse types are:
		- Array of GTS: [ {...}, {...}, ... ]
		- Array of array GTS: [ [{...}, {...}, ...] ]
		- Table: [{ columns: [...], rows: [...] }]
		- Nested List: [  [ {...}, {...}, ... ], {...}, ... ]

	*/
	//Recup GTSList of the response body
	var gtsList b.GTSList

	// If the response is a table...
	var tableResults []TableResult
	if err = json.Unmarshal(body, &tableResults); err != nil {
		logger.Info("Table parsing error ", tableResults)
	} else {
		if len(tableResults) > 0 && tableResults[0].Columns != nil && tableResults[0].Rows != nil {
			var frames = make(data.Frames, 1)

			fields := []*data.Field{}
			for i, col := range tableResults[0].Columns {

				var r []interface{}
				// Collect data for the current column
				for _, row := range tableResults[0].Rows {
					if i < len(row) {
						r = append(r, row[i])
					}
				}

				// Check the type of the first element to infer type
				if len(r) > 0 {
					switch r[0].(type) {
					case string:
						var stringValues []string
						for _, v := range r {
							if v == nil {
								v = ""
							}
							stringValues = append(stringValues, v.(string))
						}
						field := data.NewField(col.Text, nil, stringValues)
						fields = append(fields, field)
					case float64:
						var floatValues []float64
						for _, v := range r {
							if v == nil {
								v = 0
							}
							floatValues = append(floatValues, v.(float64))
						}
						field := data.NewField(col.Text, nil, floatValues)
						fields = append(fields, field)
					default:
						logger.Warn("Unsupported data type for column", col.Text)
						continue
					}
				}
			}
			frames[0] = data.NewFrame("tableResults", fields...)
			return backend.DataResponse{Frames: frames}
		}
	}

	// If the result if an array made of GTS or GTSList
	gtsList = b.GTSList{}
	result := gjson.GetBytes(body, "@flatten")
	var raw []byte
	if result.Index > 0 {
		raw = body[result.Index : result.Index+len(result.Raw)]
	} else {
		raw = []byte(result.Raw)
	}

	if err = json.Unmarshal([]byte(raw), &gtsList); err != nil {
		var errStr = fmt.Sprintf("json unmarshal: %v", err.Error())
		logger.Error("flatten error", errStr)
	}

	//Frames creation
	var frames = make(data.Frames, len(gtsList))
	var wg sync.WaitGroup
	var mu sync.Mutex

	for idx, gts := range gtsList {
		wg.Add(1)

		idx := idx
		go func(gts *b.GTS) {
			defer wg.Done()

			//Data tab creation
			var vTimes = make([]time.Time, len(gts.Values))
			var vValueFloat []float64
			var vValueString []string
			var vValueInt []int64

			//Data type check ( 0 - float / 1 - string / 2 - int )
			t := 0
			for _, values := range gts.Values {
				switch values[len(values)-1].(type) {
				case string:
					t = 1
				case int:
					if t != 1 {
						t = 2
					}
				}
			}

			//Add data to tab
			for i, values := range gts.Values {
				switch epoch := values[0].(type) {
				case float64:
					vTimes[i] = timeFromFloat64(epoch)
					if t == 0 {
						vValueFloat = append(vValueFloat, values[len(values)-1].(float64))
					} else if t == 1 {
						vValueString = append(vValueString, values[len(values)-1].(string))
					} else {
						vValueInt = append(vValueInt, values[len(values)-1].(int64))
					}
				default:
					var errStr = fmt.Sprintf("epoch read: %v", epoch)
					logger.Error(errStr)
				}
			}

			//Fields creation
			var fieldValue *data.Field
			if t == 0 {
				fieldValue = data.NewField(gts.ClassName, nil, vValueFloat)
			} else if t == 1 {
				fieldValue = data.NewField(gts.ClassName, nil, vValueString)
			} else {
				fieldValue = data.NewField(gts.ClassName, nil, vValueInt)
			}

			// add the field to the response.
			mu.Lock()
			frames[idx] = data.NewFrame(gts.ClassName,
				data.NewField("time", nil, vTimes),
				fieldValue,
			)
			mu.Unlock()
		}(gts)
	}

	wg.Wait()

	return backend.DataResponse{Frames: frames}
}

// CheckHealth handles health checks sent from Grafana to the plugin.
// The main use case for these health checks is the test button on the
// datasource configuration page which allows users to verify that
// a datasource is working as expected.
func (d *Datasource) CheckHealth(_ context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	var status = backend.HealthStatusOk
	var message = "Data source is working !"

	_, err := d.client.Exec("1 2 +")

	if err != nil {
		status = backend.HealthStatusError
		message = err.Error()
	}

	return &backend.CheckHealthResult{
		Status:  status,
		Message: message,
	}, nil
}

func timeFromFloat64(t float64) time.Time {
	secs := int64(t / 1e6)
	nsecs := int64((t - float64(secs)) / 1e3)
	return time.Unix(secs, nsecs)
}
