package plugin

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	l "github.com/grafana/grafana-plugin-sdk-go/backend/log"
	b "github.com/miton18/go-warp10/base"
	"log"
	"os"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

var client *b.Client
var ds Datasource

func TestMain(m *testing.M) {
	ctx := context.Background()
	req := testcontainers.ContainerRequest{
		Image:        "warp10io/warp10:3.4.1-alpine",
		ExposedPorts: []string{"8080/tcp", "8081/tcp"},
		WaitingFor: wait.ForHTTP("/api/v0/exec").
			WithStartupTimeout(60 * time.Second).
			WithPort("8080/tcp"),
	}
	warpContainer, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: req,
		Started:          true,
	})

	if err != nil {
		log.Fatalf("%s", err.Error())
	}

	logger := l.New()
	port, _ := warpContainer.Ports(ctx)
	logger.Info(fmt.Sprintf("ports: %s", port["8080/tcp"][0].HostPort))

	if len(port["8080/tcp"]) < 1 {
		log.Fatalf("Failed to get 8080/tcp port")
	}
	warpPort := port["8080/tcp"][0].HostPort
	client = b.NewClient(fmt.Sprintf("http://localhost:%v", warpPort))
	ds = Datasource{client}

	exitVal := m.Run()

	if err := testcontainers.TerminateContainer(warpContainer); err != nil {
		log.Fatalf("Failed to terminate container: %s", err)
	}

	os.Exit(exitVal)
}

func TestTableResultQuery(t *testing.T) {
	wsQuery := `{
		"expr": "{ 'columns' [ { 'text' 'columnA' 'type' 'number' 'sort' true 'desc' true } { 'text' 'columnB' 'type' 'number' } ] 'rows' [ [ 10 20 ] [ 100 200 ] [ 100 200 ] [ 100 200 ] [ 100 200 ] [ 100 200 ] [ 100 200 ] [ 100 200 ] ] }"
	}`

	var jsonRawMsg json.RawMessage
	if err := json.Unmarshal([]byte(wsQuery), &jsonRawMsg); err != nil {
		t.Errorf("Failed to parse JSON: %v", err)
	}

	queryDataRes, err := ds.QueryData(context.Background(), &backend.QueryDataRequest{
		PluginContext: backend.PluginContext{},
		Headers:       nil,
		Queries: []backend.DataQuery{
			{
				RefID:         "A",
				QueryType:     "",
				MaxDataPoints: 0,
				Interval:      0,
				TimeRange: backend.TimeRange{
					From: time.Now().Add(-time.Hour),
					To:   time.Now(),
				},
				JSON: jsonRawMsg,
			},
		},
	})

	if err != nil {
		t.Errorf("Failed to execute query: %v", err)
	}

	// the value .results.A.frames[0].refId = "A" was removed from shoul be value, Grafana may add it after making a request to proxy
	responseShouldBe := `{"results":{"A":{"status":200,"frames":[{"schema":{"name":"tableResults","fields":[{"name":"columnA","type":"number","typeInfo":{"frame":"float64","nullable":true}},{"name":"columnB","type":"number","typeInfo":{"frame":"float64","nullable":true}}]},"data":{"values":[[10,100,100,100,100,100,100,100],[20,200,200,200,200,200,200,200]]}}]}}}`
	jsonResponse, err := queryDataRes.MarshalJSON()

	if err != nil {
		t.Errorf("Failed to marshal JSON: %v", err)
	}

	if !bytes.Equal([]byte(responseShouldBe), jsonResponse) {
		t.Errorf("Response does not match expected output")
	}

}

func TestGTSListQuery(t *testing.T) {
	wsQuery := `{
		"expr": "[ { 'c' 'testClass' 'l' {} 'a' {} 'v' [ [ 1619784000000000 42.5 ] [ 1619784001000000 43.2 ] ] } ]"
	}`

	var jsonRawMsg json.RawMessage
	if err := json.Unmarshal([]byte(wsQuery), &jsonRawMsg); err != nil {
		t.Errorf("Failed to parse JSON: %v", err)
	}

	queryDataRes, err := ds.QueryData(context.Background(), &backend.QueryDataRequest{
		PluginContext: backend.PluginContext{},
		Headers:       nil,
		Queries: []backend.DataQuery{
			{
				RefID:         "A",
				QueryType:     "",
				MaxDataPoints: 0,
				Interval:      0,
				TimeRange: backend.TimeRange{
					From: time.Now().Add(-time.Hour),
					To:   time.Now(),
				},
				JSON: jsonRawMsg,
			},
		},
	})

	if err != nil {
		t.Errorf("Failed to execute query: %v", err)
	}

	// the value .results.A.frames[0].refId = "A" was removed from responseShouldBe value, Grafana may add it after making a request to proxy
	responseShouldBe := `{"results":{"A":{"status":200,"frames":[{"schema":{"fields":[{"name":"time","type":"time","typeInfo":{"frame":"time.Time"}},{"name":"testClass{}","type":"number","typeInfo":{"frame":"float64"}}]},"data":{"values":[[1619784000000,1619784001000],[42.5,43.2]]}}]}}}`
	jsonResponse, err := queryDataRes.MarshalJSON()

	if err != nil {
		t.Errorf("Failed to marshal JSON: %v", err)
	}

	if !bytes.Equal([]byte(responseShouldBe), jsonResponse) {
		t.Errorf("Response does not match expected output. JSON response is '%s'", jsonResponse)
	}
}

func TestArrayQuery(t *testing.T) {
	wsQuery := `{
		"expr": "[ 42.5 43.2 44.1 ]"
	}`

	var jsonRawMsg json.RawMessage
	if err := json.Unmarshal([]byte(wsQuery), &jsonRawMsg); err != nil {
		t.Errorf("Failed to parse JSON: %v", err)
	}

	queryDataRes, err := ds.QueryData(context.Background(), &backend.QueryDataRequest{
		PluginContext: backend.PluginContext{},
		Headers:       nil,
		Queries: []backend.DataQuery{
			{
				RefID:         "A",
				QueryType:     "",
				MaxDataPoints: 0,
				Interval:      0,
				TimeRange: backend.TimeRange{
					From: time.Now().Add(-time.Hour),
					To:   time.Now(),
				},
				JSON: jsonRawMsg,
			},
		},
	})

	if err != nil {
		t.Errorf("Failed to execute query: %v", err)
	}

	// the value .results.A.frames[0].refId = "A" was removed from shoul be value, Grafana may add it after making a request to proxy
	responseShouldBe := `{"results":{"A":{"status":200,"frames":[{"schema":{"name":"arrayResults","fields":[{"name":"array_value","type":"number","typeInfo":{"frame":"float64","nullable":true}}]},"data":{"values":[[42.5,43.2,44.1]]}}]}}}`
	jsonResponse, err := queryDataRes.MarshalJSON()

	if err != nil {
		t.Errorf("Failed to marshal JSON: %v", err)
	}

	if !bytes.Equal([]byte(responseShouldBe), jsonResponse) {
		t.Errorf("Response does not match expected output")
	}
}

func TestScalarQuery(t *testing.T) {
	wsQuery := `{
		"expr": "42"
	}`

	var jsonRawMsg json.RawMessage
	if err := json.Unmarshal([]byte(wsQuery), &jsonRawMsg); err != nil {
		t.Errorf("Failed to parse JSON: %v", err)
	}

	queryDataRes, err := ds.QueryData(context.Background(), &backend.QueryDataRequest{
		PluginContext: backend.PluginContext{},
		Headers:       nil,
		Queries: []backend.DataQuery{
			{
				RefID:         "A",
				QueryType:     "",
				MaxDataPoints: 0,
				Interval:      0,
				TimeRange: backend.TimeRange{
					From: time.Now().Add(-time.Hour),
					To:   time.Now(),
				},
				JSON: jsonRawMsg,
			},
		},
	})

	if err != nil {
		t.Errorf("Failed to execute query: %v", err)
	}

	// the value .results.A.frames[0].refId = "A" was removed from shoul be value, Grafana may add it after making a request to proxy
	responseShouldBe := `{"results":{"A":{"status":200,"frames":[{"schema":{"name":"scalarResult","fields":[{"name":"scalar_value_float64","type":"number","typeInfo":{"frame":"float64"}}]},"data":{"values":[[42]]}}]}}}`
	jsonResponse, err := queryDataRes.MarshalJSON()

	if err != nil {
		t.Errorf("Failed to marshal JSON: %v", err)
	}

	if !bytes.Equal([]byte(responseShouldBe), jsonResponse) {
		t.Errorf("Response does not match expected output")
	}
}
