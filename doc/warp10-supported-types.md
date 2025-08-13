# Supported Warp10 Response Structures

This plugin **only supports a limited set of Warp 10 response data structures** for queries.

Below is the exact list of supported structures and how they are parsed and converted to Grafana frames.

## 1. Table Result

**Structure:**  
A JSON array with at least one object containing `columns` and `rows`.

```json
[
  {
    "columns": [
      { "text": "columnA", "type": "number", "sort": true, "desc": true },
      { "text": "columnB", "type": "number" }
    ],
    "rows": [
      [10, 20],
      [100, 200]
    ]
  }
]
```
- Must be an array of objects with `columns` (array of objects) and `rows` (array of arrays).
- Only the **first object** is parsed if multiple objects are present.

## 2. GTS List (Geo Time Series)

**Structure:**  
An array of GTS objects.

```json
[
  {
    "c": "className",
    "l": { "label": "value" },
    "a": {},
    "v": [
      [1619784000000000, 42.5],
      [1619784001000000, 43.2]
    ]
  }
]
```

- `v` is an array of `[timestamp, value]`. Timestamps are in microseconds (converted to milliseconds).
- Values can be float, string, or integer.
- Labels are included in the field name unless `hideLabels` is set.

## 3. List of GTS

**Structure:**  
An array of GTS objects or a nested array (array of arrays of GTS objects):

```json
[
  [{...}, {...}],
  {...}
]

```

- Both flat and single-level nested arrays of GTS are supported.

## 4. Array of Scalars

**Structure:**  
A JSON array containing one array of homogeneous scalar values (float, string, or bool):

```json
[[42.5, 43.2, 44.1]]
```
or
```json
[["a", "b", "c"]]
```
or
```json
[[true, false, true]]
```
- Only single-dimensional arrays are supported.

## 5. Scalar

**Structure:**  
A JSON array with a single value:


```json
[42.5]
```
or
```json
["test value"]
```
or
```json
[true]
```
- Only the first value is used.
- Supported types: float64, string, bool.

## Unsupported Structures

All others form of data structure are not supported.

If the data structure is incorrect, you will receive an error `no supported response type found`.
