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
func NewDatasource(_ context.Context, ds backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {

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
		- Array of String,Int64,Float64
		- String, Int64, Float64 element
		- Array of GTS: [ {...}, {...}, ... ]
		- Array of array GTS: [ [{...}, {...}, ...] ]
		- Table: [{ columns: [...], rows: [...] }]
		- Nested List: [  [ {...}, {...}, ... ], {...}, ... ]
	*/

	// If the response is a table...
	backendTableResult, err := parseTableResult(body)
	if err == nil {
		return backendTableResult
	}

	// If the result is an array made of GTS or GTSList
	gtsListResult, err := parseGTSListResult(body)
	if err == nil {
		return gtsListResult
	}

	// if response is an array
	backendArrayResult, err := parseArrayResult(body)
	if err == nil {
		return backendArrayResult
	}

	// all others warp10 response
	backendScalarResult, err := parseScalarResult(body)
	if err == nil {
		return backendScalarResult
	}

	return backend.DataResponse{Error: fmt.Errorf("no supported response type found")}
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

// time from warp10 in microseconds
// grafana needs milliseconds
func timeFromFloat64(t float64) time.Time {
	return time.UnixMicro(int64(t))
}

func parseTableResult(result []byte) (backend.DataResponse, error) {
	var tableResults []TableResult
	if errRes := json.Unmarshal(result, &tableResults); errRes != nil {
		errMsg := fmt.Errorf("table parsing error")
		return backend.DataResponse{}, errMsg
	}

	if len(tableResults) > 0 && tableResults[0].Columns != nil && tableResults[0].Rows != nil {
		var frames = make(data.Frames, 1)

			var fields []*data.Field
			for i, col := range tableResults[0].Columns {

				var r []interface{}
				// Collect data for the current column
				for _, row := range tableResults[0].Rows {
					if i >= len(row) {
						r = append(r, nil)
					} else {
						r = append(r, row[i])
					}
				}

				if field, err := convertListToField(r, col.Text); err != nil {
					return backend.DataResponse{}, fmt.Errorf("table parsing error: %v", err)
				} else {
					fields = append(fields, field)
				}
			}

			frames[0] = data.NewFrame("tableResults", fields...)
			return backend.DataResponse{Frames: frames}, nil
		}
	}

	return backend.DataResponse{}, fmt.Errorf("Table parsing error")
}

func parseGTSListResult(result []byte) (backend.DataResponse, error) {
	logger := log.New()

	var gtsList = b.GTSList{}
	flattenResult := gjson.GetBytes(result, "@flatten")
	var raw []byte
	if flattenResult.Index > 0 {
		raw = result[flattenResult.Index : flattenResult.Index+len(flattenResult.Raw)]
	} else {
		raw = []byte(flattenResult.Raw)
	}

	if err := json.Unmarshal([]byte(raw), &gtsList); err != nil {
		var errStr = fmt.Sprintf("json unmarshal: %v, gtslist %v", err.Error(), gtsList)
		logger.Debug("Flatten error", errStr)
	} else {
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

		return backend.DataResponse{Frames: frames}, nil
	}

	return backend.DataResponse{}, fmt.Errorf("GTSList parsing error")
}

func parseArrayResult(result []byte) (backend.DataResponse, error) {
	logger := log.New()

	var warp10ArrayResult [][]interface{}
	if err := json.Unmarshal(result, &warp10ArrayResult); err != nil {
		logger.Debug("Array parsing error ", warp10ArrayResult)
	} else {
		logger.Debug("Array results parsing error ", warp10ArrayResult)

		// warp10 response is always an array
		if len(warp10ArrayResult) == 0 {
			return backend.DataResponse{}, fmt.Errorf("array parsing error. Response unmarshal but warp10 array is empty")
		}
		var arrayRes = warp10ArrayResult[0]

		var fields []*data.Field
		if field, err := convertListToField(arrayRes, "array_value"); err != nil {
			return backend.DataResponse{}, fmt.Errorf("array parsing error: %v", err)
		} else {
			fields = append(fields, field)
		}

		var frames = make(data.Frames, 1)
		frames[0] = data.NewFrame("arrayResults", fields...)
		return backend.DataResponse{Frames: frames}, nil
	}

	return backend.DataResponse{}, fmt.Errorf("array parsing error")
}

func parseScalarResult(result []byte) (backend.DataResponse, error) {
	logger := log.New()

	var warp10ScalarResult []interface{}
	if err := json.Unmarshal(result, &warp10ScalarResult); err != nil {
		logger.Debug("Scalar parsing error", warp10ScalarResult)
	} else {
		logger.Debug("warp10ScalarResult", warp10ScalarResult)

		// warp10 response is always an array
		if len(warp10ScalarResult) == 0 {
			return backend.DataResponse{}, fmt.Errorf("scalar parsing error. Response unmarshal but warp10 array is empty")
		}
		var scalarRes = warp10ScalarResult[0]

		var fields []*data.Field

		switch v := scalarRes.(type) {
		case string:
			field := data.NewField("scalar_value_string", nil, []string{v})
			fields = append(fields, field)
		case int64:
			field := data.NewField("scalar_value_int64", nil, []int64{v})
			fields = append(fields, field)
		case float64:
			field := data.NewField("scalar_value_float64", nil, []float64{v})
			fields = append(fields, field)
		case bool:
			field := data.NewField("scalar_value_bool", nil, []bool{v})
			fields = append(fields, field)
		default:
			logger.Debug("No response type found: warp10 result:", warp10ScalarResult)
			return backend.DataResponse{Error: fmt.Errorf("no response type found")}, nil
		}

		logger.Debug("Sent scalar dataframe in response")

		var frames = make(data.Frames, 1)
		frames[0] = data.NewFrame("scalarResult", fields...)
		return backend.DataResponse{Frames: frames}, nil
	}

	return backend.DataResponse{}, fmt.Errorf("Scalar parsing error")
}

func convertListToField(values []interface{}, className string) (*data.Field, error) {
	logger := log.New()
	var field *data.Field

	// If empty list, return empty field
	if len(values) == 0 {
		return data.NewField(className, nil, []*string{}), nil
	}

	// Infer type from first element
	var firstNonNullElement interface{} = nil
	for _, v := range values {
		if v != nil {
			firstNonNullElement = v
			break
		}
	}

	if firstNonNullElement == nil {
		var stringValues []*string
		for range values {
			stringValues = append(stringValues, nil)
		}
		return data.NewField(className, nil, stringValues), nil
	}

	switch firstNonNullElement.(type) {
	case string:
		var stringValues []*string
		for _, v := range values {
			var s string
			if v != nil {
				s = v.(string)
				stringValues = append(stringValues, &s)
			} else {
				stringValues = append(stringValues, nil)
			}
		}
		field = data.NewField(className, nil, stringValues)
	case float64:
		var floatValues []*float64
		for _, v := range values {
			var f float64
			if v != nil {
				f = v.(float64)
				floatValues = append(floatValues, &f)
			} else {
				floatValues = append(floatValues, nil)
			}
		}
		field = data.NewField(className, nil, floatValues)
	case bool:
		var boolValues []*bool
		for _, v := range values {
			var bVal bool
			if v != nil {
				bVal = v.(bool)
				boolValues = append(boolValues, &bVal)
			} else {
				boolValues = append(boolValues, nil)
			}
		}
		field = data.NewField(className, nil, boolValues)
	default:
		logger.Debug("Unsupported data type for", className)
		return nil, fmt.Errorf("unsupported data type for %v", className)
	}

	return field, nil
}
