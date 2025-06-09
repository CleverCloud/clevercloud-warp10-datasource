package plugin

import "time"

type ConstProp struct {
	name  string
	value string
}

type WarpDataSourceOptions struct {
	Path string `json:"path"`
}

// GrafanaRequest describe a warp10 request from Grafana
type GrafanaRequest struct {
	Queries []WSQuery
	Range   Range  `json:"range"`
	From    string `json:"from"`
	To      string `json:"to"`
}

type WSQuery struct {
	Datasource    WSDatasource `json:"datasource"`
	RefID         string       `json:"refId"`
	Expr          string       `json:"expr"`
	DatasourceID  int          `json:"datasourceId"`
	IntervalMs    int          `json:"intervalMs"`
	MaxDataPoints int          `json:"maxDataPoints"`
	HideLabels    bool         `json:"hideLabels"`
}

type WSDatasource struct {
	Type string `json:"type"`
	UID  string `json:"uid"`
}

type Range struct {
	From CustomTime `json:"from"`
	To   CustomTime `json:"to"`
	Raw  RawRange   `json:"raw"`
}

type RawRange struct {
	From string `json:"from"`
	To   string `json:"to"`
}

// CustomTime is a wrapper around time.Time to handle custom unmarshaling
type CustomTime struct {
	time.Time
}

// TableResult is another type of response from warp10 with GTSList
type TableResult struct {
	Columns []struct {
		Text string `json:"text"`
		Type string `json:"type"`
		Sort bool   `json:"sort"`
		Desc bool   `json:"desc"`
	} `json:"columns"`
	Rows [][]interface{} `json:"rows"`
}
