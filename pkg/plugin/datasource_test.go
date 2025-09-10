package plugin

import (
	"context"
	"encoding/json"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	b "github.com/miton18/go-warp10/base"
	"testing"
)

func TestQueryData(t *testing.T) {
	ds := Datasource{}

	resp, err := ds.QueryData(
		context.Background(),
		&backend.QueryDataRequest{
			Queries: []backend.DataQuery{
				{RefID: "A"},
			},
		},
	)
	if err != nil {
		t.Error(err)
	}

	if len(resp.Responses) != 1 {
		t.Fatal("QueryData must return a response")
	}
}

func TestParseTableResult(t *testing.T) {
	tableResult := `[{
		"columns": [
			{
				"text": "columnA",
				"type": "number",
				"sort": true,
				"desc": true
			},
			{
				"text": "columnB",
				"type": "number"
			}
		],
		"rows": [
			[10, 20],
			[100, 200]
		]
	}]`

	tableResultB := []byte(tableResult)
	resp, err := parseTableResult(tableResultB)
	if err != nil {
		t.Error(err)
	}

	if len(resp.Frames) != 1 {
		t.Fatal("Expected 1 frame in response")
	}

	frame := resp.Frames[0]
	if frame.Name != "tableResults" {
		t.Errorf("Expected frame name to be 'tableResults', got %s", frame.Name)
	}

	if len(frame.Fields) != 2 {
		t.Fatal("Expected 2 field1 in frame")
	}

	field0 := frame.Fields[0]
	if field0.Name != "columnA" {
		t.Errorf("Expected field1 name to be 'columnA', got %s", field0.Name)
	}

	field1 := frame.Fields[1]
	if field1.Name != "columnB" {
		t.Errorf("Expected field1 name to be 'columnB', got %s", field1.Name)
	}
}

func TestParseGTSListResult(t *testing.T) {
	gtsList := `[
		{
			"c": "testClass",
			"l": {},
			"a": {},
			"v": [
				[1619784000000000, 42.5],
				[1619784001000000, 43.2]
			]
		}
	]`

	gtsListB := []byte(gtsList)
	resp, err := parseGTSListResult(gtsListB)
	if err != nil {
		t.Error(err)
	}

	if len(resp.Frames) != 1 {
		t.Fatal("Expected 1 frame in response")
	}

	// we suppress frame name to avoid duplication series name on panels
	frame := resp.Frames[0]
	expectedFrameName := ""
	if frame.Name != expectedFrameName {
		t.Errorf("Expected frame name to be '%s', got %s", expectedFrameName, frame.Name)
	}

	if len(frame.Fields) != 2 {
		t.Fatal("Expected 2 fields in frame")
	}

	timeField := frame.Fields[0]
	valueField := frame.Fields[1]

	if timeField.Name != "time" {
		t.Errorf("Expected first field name to be 'time', got %s", timeField.Name)
	}

	expectedFieldName := "testClass{}"
	if valueField.Name != expectedFieldName {
		t.Errorf("Expected second field name to be '%s', got %s", expectedFieldName, valueField.Name)
	}
}

func TestParseArrayResultString(t *testing.T) {
	stringArray := `[[
		"value1",
		"value2",
		"value3"
	]]`

	resp, err := parseArrayResult([]byte(stringArray))
	if err != nil {
		t.Error(err)
	}

	if len(resp.Frames) != 1 {
		t.Fatal("Expected 1 frame in response")
	}

	frame := resp.Frames[0]
	if frame.Name != "arrayResults" {
		t.Errorf("Expected frame name to be 'arrayResults', got %s", frame.Name)
	}

	if len(frame.Fields) != 1 {
		t.Fatal("Expected 1 field in frame")
	}

	field := frame.Fields[0]
	if field.Name != "array_value" {
		t.Errorf("Expected field name to be 'array_value', got %s", field.Name)
	}

	values := []string{"value1", "value2", "value3"}
	for i, val := range values {
		vField := field.At(i).(*string)
		if *vField != val {
			t.Errorf("Expected field value to be %v, got %v", val, *vField)
		}
	}
}

func TestParseArrayResultFloat64(t *testing.T) {
	floatArray := `[[
		42,
		43,
		44
	]]`

	resp, err := parseArrayResult([]byte(floatArray))
	if err != nil {
		t.Error(err)
	}

	if len(resp.Frames) != 1 {
		t.Fatal("Expected 1 frame in response")
	}

	frame := resp.Frames[0]
	if frame.Name != "arrayResults" {
		t.Errorf("Expected frame name to be 'arrayResults', got %s", frame.Name)
	}

	if len(frame.Fields) != 1 {
		t.Fatal("Expected 1 field in frame")
	}

	field := frame.Fields[0]
	if field.Name != "array_value" {
		t.Errorf("Expected field name to be 'array_value', got %s", field.Name)
	}

	values := []float64{42, 43, 44}
	for i, val := range values {
		vField := field.At(i).(*float64)
		if *vField != val {
			t.Errorf("Expected field value to be %v, got %v", val, *vField)
		}
	}
}

func TestParseArrayResultBool(t *testing.T) {
	boolArray := `[[
		true,
		false,
		true
	]]`

	resp, err := parseArrayResult([]byte(boolArray))
	if err != nil {
		t.Error(err)
	}

	if len(resp.Frames) != 1 {
		t.Fatal("Expected 1 frame in response")
	}

	frame := resp.Frames[0]
	if frame.Name != "arrayResults" {
		t.Errorf("Expected frame name to be 'arrayResults', got %s", frame.Name)
	}

	if len(frame.Fields) != 1 {
		t.Fatal("Expected 1 field in frame")
	}

	field := frame.Fields[0]
	if field.Name != "array_value" {
		t.Errorf("Expected field name to be 'array_value', got %s", field.Name)
	}

	values := []bool{true, false, true}
	for i, val := range values {
		vField := field.At(i).(*bool)
		if *vField != val {
			t.Errorf("Expected field value to be %v, got %v", val, *vField)
		}
	}
}

func TestParseScalarResultString(t *testing.T) {
	stringScalar := `["test value"]`

	resp, err := parseScalarResult([]byte(stringScalar))
	if err != nil {
		t.Error(err)
	}

	if len(resp.Frames) != 1 {
		t.Fatal("Expected 1 frame in response")
	}

	frame := resp.Frames[0]
	if len(frame.Fields) != 1 {
		t.Fatal("Expected 1 field in frame")
	}

	field := frame.Fields[0]
	if field.Name != "scalar_value_string" {
		t.Errorf("Expected field name to be 'scalar_value_string', got %s", field.Name)
	}

	vField := field.At(0).(string)
	if vField != "test value" {
		t.Errorf("Expected field value to be 'test value', got %v", vField)
	}
}

func TestParseScalarResultFloat64(t *testing.T) {
	floatScalar := `[42.5]`

	resp, err := parseScalarResult([]byte(floatScalar))
	if err != nil {
		t.Error(err)
	}

	if len(resp.Frames) != 1 {
		t.Fatal("Expected 1 frame in response")
	}

	frame := resp.Frames[0]
	if len(frame.Fields) != 1 {
		t.Fatal("Expected 1 field in frame")
	}

	field := frame.Fields[0]
	if field.Name != "scalar_value_float64" {
		t.Errorf("Expected field name to be 'scalar_value_float64', got %s", field.Name)
	}

	vField := field.At(0).(float64)
	if vField != 42.5 {
		t.Errorf("Expected field value to be 42.5, got %v", vField)
	}
}

func TestParseScalarResultBool(t *testing.T) {
	boolScalar := `[true]`

	resp, err := parseScalarResult([]byte(boolScalar))
	if err != nil {
		t.Error(err)
	}

	if len(resp.Frames) != 1 {
		t.Fatal("Expected 1 frame in response")
	}

	frame := resp.Frames[0]
	if len(frame.Fields) != 1 {
		t.Fatal("Expected 1 field in frame")
	}

	field := frame.Fields[0]
	if field.Name != "scalar_value_bool" {
		t.Errorf("Expected field name to be 'scalar_value_bool', got %s", field.Name)
	}

	vField := field.At(0).(bool)
	if vField != true {
		t.Errorf("Expected field value to be true, got %v", vField)
	}
}

func TestNameWithLabels(t *testing.T) {
	gtsList := `
		{
			"c": "testClass",
			"l": {
				"key1": "value1",
				"key2": "value2"
			},
			"a": {},
			"v": [
				[1619784000000000, 42.5],
				[1619784001000000, 43.2]
			]
		}`

	var gts = b.GTS{}
	if err := json.Unmarshal([]byte(gtsList), &gts); err != nil {
		t.Errorf("json unmarshal: %v, gtslist %v", err.Error(), gtsList)
	}

	fullName := nameWithLabels(gts)

	expectedFullName := "testClass{key1=value1,key2=value2}"
	if fullName != expectedFullName {
		t.Errorf("Wrong gts name. Expected %s got %s", expectedFullName, fullName)
	}
}

func TestNameWithLabelsEmpty(t *testing.T) {
	gtsList := `
		{
			"c": "testClass",
			"l": {},
			"a": {},
			"v": [
				[1619784000000000, 42.5],
				[1619784001000000, 43.2]
			]
		}`

	var gts = b.GTS{}
	if err := json.Unmarshal([]byte(gtsList), &gts); err != nil {
		t.Errorf("json unmarshal: %v, gtslist %v", err.Error(), gtsList)
	}

	fullName := nameWithLabels(gts)

	expectedFullName := "testClass{}"
	if fullName != expectedFullName {
		t.Errorf("Wrong gts name. Expected %s got %s", expectedFullName, fullName)
	}
}

func TestNameWithLabelsInOrder(t *testing.T) {
	gtsList := `
		{
			"c": "testClass",
			"l": {
				"aKey": "aValue",
				"cKey": "cValue",
				"bKey": "bValue",
				".aKey": "aValue"
			},
			"a": {},
			"v": [
				[1619784000000000, 42.5],
				[1619784001000000, 43.2]
			]
		}`

	var gts = b.GTS{}
	if err := json.Unmarshal([]byte(gtsList), &gts); err != nil {
		t.Errorf("json unmarshal: %v, gtslist %v", err.Error(), gtsList)
	}

	fullName := nameWithLabels(gts)

	expectedFullName := "testClass{.aKey=aValue,aKey=aValue,bKey=bValue,cKey=cValue}"
	if fullName != expectedFullName {
		t.Errorf("Wrong gts name. Expected %s got %s", expectedFullName, fullName)
	}
}
