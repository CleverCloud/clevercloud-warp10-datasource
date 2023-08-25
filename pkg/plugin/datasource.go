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

type ConstProp struct {
	name  string
	value string
}

type WarpDataSourceOptions struct {
	Path string `json:"path"`
}

// NewDatasource creates a new datasource instance.
func NewDatasource(ds backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {

	var logger log.Logger
	logger = log.New()

	var jsonData WarpDataSourceOptions

	var err = json.Unmarshal(ds.JSONData, &jsonData)
	if err != nil {
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

	// loop over queries and execute them individually.
	for _, q := range req.Queries {
		res := d.query(ctx, req.PluginContext, q)

		// save the response in a hashmap
		// based on with RefID as identifier
		response.Responses[q.RefID] = res
	}

	return response, nil
}

type Query struct {
	QueryText string `json:"queryText"`
}

func (d *Datasource) query(_ context.Context, pCtx backend.PluginContext, query backend.DataQuery) backend.DataResponse {

	var logger = log.New()
	var qm Query

	//Recup warpscript text
	err := json.Unmarshal(query.JSON, &qm)
	if err != nil {
		var errStr = fmt.Sprintf("json unmarshal: %v", err.Error())
		logger.Error(errStr)
		return backend.ErrDataResponse(backend.StatusBadRequest, errStr)
	}

	// Exec query
	body, err := d.client.Exec(qm.QueryText)
	if err != nil {
		var errStr = fmt.Sprintf("client exec: %v", err.Error())
		logger.Error(errStr)
		return backend.ErrDataResponse(backend.StatusInternal, errStr)
	}

	//Recup GTSList of the response body
	var stack []b.GTSList
	if err = json.Unmarshal(body, &stack); err != nil {
		var errStr = fmt.Sprintf("json unmarshal: %v", err.Error())
		logger.Error(errStr)
		return backend.ErrDataResponse(backend.StatusBadRequest, errStr)
	}

	var gtsList = stack[0]

	//Frames creation
	var frames = make(data.Frames, len(gtsList))

	for idx, gts := range gtsList {

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
				return backend.ErrDataResponse(backend.StatusInternal, errStr)
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
		frames[idx] = data.NewFrame(gts.ClassName,
			data.NewField("time", nil, vTimes),
			fieldValue,
		)

	}

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
