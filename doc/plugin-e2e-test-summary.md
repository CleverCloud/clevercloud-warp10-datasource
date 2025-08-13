# Warp10 Plugin End-to-End Testing with Playwright

#### This project implements robust **automated frontend UI and integration tests** for the **Warp10 Grafana plugin** using **Playwright**. With increasing plugin complexity and version fragmentation, these tests help **prevent regressions**, **verify datasource behavior**, and **validate user interaction flows**.

We no longer use Cypress — Playwright is the **officially supported framework** with the Grafana Plugin SDK. These tests are designed to **run both locally** and in **CI environments** (GitHub Actions).

---
## Testing Goals

- Provide confidence while supporting **multiple Grafana versions**
- Allow local reproducibility without relying on preproduction environments
- Maintain frontend and integration coverage using **Playwright**

---

## How to Run Locally (With UI Only)
> **Supported Browsers:**
> - All tests are validated on **Chromium** and **Firefox**.
> - **Safari (Webkit)** is explicitly **not supported** due to recurring instability in both local and CI environments.

### 1. Start Local Stack

```bash
  docker compose -f docker-compose-plugin.yaml up
```

This launches:
- Warp10 server (`warp10:8080`)
- Grafana server (`grafana:3000`)
- Warp10 preconfigured with a mock token

### 2. Launch Playwright in UI Mode

```bash
  npx playwright test --ui
```

> 💡 Prefer running each browser individually (Chrome or Firefox).  

---

## GitHub CI (playwright.yml)

Configured to:
- Start Docker stack (Grafana + Warp10)
- Run `npx playwright install` for browsers

---

## Token (warp10.conf)

```conf
warp.token.mytoken = {
  'owner' 'test'
  'producer' 'test'
  'application' 'testapp'
  'ttl' 0
  'labels' { }
}
```

---

## File Overview

### Scope: One test = One file

#### `scenario.spec.ts` (Integration)
#### `datasource_test.spec.ts` (Datasource Component)
#### `editor_test.spec.ts` (Editor Component)
#### `type_test.spec.ts` (Regression/Test Bed)
#### `macro_test.spec.ts` (Macro Parsing)
#### `constant_valid_test.spec.ts` (Valid constant injection)
#### `constant_invalid_test.spec.ts` (Error handling for missing constants)
#### `const_variable_test.spec.ts`  (Constant Variable Functionality)
#### `interval_variable_test.spec.ts` (Interval Variable Functionality)
#### `query_variable_test.spec.ts` (Query Variable Functionality)
#### `healthCheck_test.spec.ts` (Datasource Healthcheck)
#### `custom_multi_variable_test.spec.ts` (Custom Multi-Value Variable Functionality) 
#### `editor_json_model_test.spec.ts` (Editor JSON Model Verification)

---
## Tests Folder Structure

### The following tree shows the complete organization of configuration, test, and source files in the project:

<details>
<summary><strong>Folder Structure (click to expand/collapse)</strong></summary>

- tests
  - __config__
    - [docker-compose-plugin.yaml](tests/config/docker-compose-plugin.yaml)
    - __grafana_volumes__
      - __provisioning__
        - __dashboards__
          - [dashboard.yml](tests/config/grafana_volumes/provisioning/dashboards/dashboard.yml)
          - [test_dashboard.json](tests/config/grafana_volumes/provisioning/dashboards/test_dashboard.json)
        - __datasources__
          - [datasources.yml](tests/config/grafana_volumes/provisioning/datasources/datasources.yml)
          - [warp10.conf](tests/config/warp10.conf)
  - __datasource__
    - [datasource_test.spec.ts](tests/datasource/datasource_test.spec.ts)
  - __health__
    - [healthCheck_test.spec.ts](tests/health/healthCheck_test.spec.ts)
  - __editor__
    - [editor_test.spec.ts](tests/editor/editor_test.spec.ts)
    - [editor_json_model_test.spec.ts](tests/editor/editor_json_model_test.spec.ts)
  - __requests__
    - __features__
      - [constant_invalid_test.spec.ts](tests/requests/features/constant_invalid_test.spec.ts)
      - [constant_valid_test.spec.ts](tests/requests/features/constant_valid_test.spec.ts)
      - [macro_test.spec.ts](tests/requests/features/macro_test.spec.ts)
    - __types__
      - [type_test.spec.ts](tests/requests/types/type_test.spec.ts)
    - __variables__
       - [const_variable_test.spec.ts](tests/requests/variables/const_variable_test.spec.ts)
       - [interval_variable_test.spec.ts](tests/requests/variables/interval_variable_test.spec.ts)
       - [query_variable_test.spec.ts](tests/requests/variables/query_variable_test.spec.ts)
       - [custom_multi_variable_test.spec.ts](tests/requests/variables/custom_multi_variable_test.spec.ts)
    - __scenario_
       - [senario.spec.ts](tests/scenario/senario.spec.ts)
    - [utils.ts](tests/utils.ts)


</details>

---



## Integration Scenario: Warp10 Datasource End-to-End Test

This scenario validates the entire lifecycle of a Warp10 datasource within Grafana.It covers creation, configuration, query validation, error handling, and cleanup for the Warp10 datasource in Grafana.  
Each step includes explicit verification to ensure correct and robust implementation.


### Steps

1. **Create and Initialize Warp10 Datasource**
   - Instantiate a new Warp10 datasource from the Grafana UI.
   - Set the datasource name (`test_warp10`) and the backend URL (`http://warp10:8080`).
   - Save and test the connection. Confirm that the health check message indicates a successful connection.
   - Attempt to misconfigure the URL required fields to ensure that errors are correctly reported.

2. **Create Dashboard and Add Panel**
   - Create a new dashboard and open the panel editor.
   - Ensure that the dashboard is created and the panel editor loads as expected.

3. **Select the Warp10 Datasource**
   - In the panel editor, select the newly created `test_warp10` datasource.
   - Confirm that the selected datasource is active for the panel.

4. **Inject and Execute Query**
   - Enter a valid Warp10 query (`1 2 +`) into the query editor.
   - Run the query and capture the `/api/ds/query` response.
   - Assert that the response status is `200 OK` and that the result matches the expected output.

5. **Datasource Configuration Validation**
   - Deliberately input an invalid URL.
   - Confirm that the "Save & Test" operation fails and an appropriate error message is displayed.

6. **Cleanup**
   - Delete the `test_warp10` datasource from the management page.
   - Confirm that the datasource is no longer listed among available datasources.

---

## Datasource Component: Warp10 Datasource Configuration and Healthcheck

This test validates the configuration interface for the Warp10 datasource in Grafana.  
It covers input validation, positive/negative feedback for configuration, health check integration with the Warp10 backend, and data persistence for the Warp10 datasource setup.  
Every step includes explicit checks for field handling, healthcheck responses, user feedback, and form persistence.

### Steps

1. **Validate All Input Fields**
   - Open the new Warp10 datasource creation form.
   - **Fields Tested:**
      - URL
      - Macros (name and value)
      - Constants (name and value)
   - Ensure all required fields are visible and interactable.

2. **Datasource Test & Save with Various Configurations**
   - Use the **"Save & Test"** button after filling the form.
   - Test with:
      - An **invalid URL** → confirm error is shown.
      - A **valid URL** → confirm success message is returned.

3. **Health Check Endpoint Validation**
   - Confirm that the datasource component makes a health check call against `/api/v0/version` (through `/health` endpoint).
   - For a healthy Warp10 backend, verify that the health check passes.
   - For a misconfigured backend or unreachable URL, verify that the error is detected and shown in the UI.

4. **Persistence and Reload**
   - Save valid configuration with macros and constants, then reload the page.
   - Confirm that all previously entered values (macros, constants, token, URL) persist and are displayed correctly after reload.

5. **Cleanup**
   - Delete the test datasource.
   - Confirm that the datasource no longer appears in the list of available datasources.

---

## Editor Component Scenario: Warp10 Query Editor Rendering & Validation

This scenario tests the Warp10 query editor component in Grafana. It covers query editor rendering, advanced WarpScript macro support, outbound query model validation, and correctness of the user’s script content.  
Each step includes explicit checks for rendering, input flexibility, macro detection, and correctness of the underlying data model exchanged with the backend.


### Steps

1. **Editor Rendering and Visibility**
   - Navigate to a dashboard and open the panel query editor.
   - Assert that the query editor is both attached to the DOM and visible.

2. **Internal JSON Model Structure and Validation**
   - Trigger a query execution from the editor.
   - Intercept the outgoing `/api/ds/query` POST request and capture its response.
   - Check that the response has status `200 OK`.
   - Assert that the returned JSON model includes the expected structure (`results.A`, schema, data array, etc.).
   - Confirm that the schema name is a string and data values are valid arrays.
   - For each response, log and check the integrity of the model (status codes, array types, field existence).

3. **Editor Content Validation**
   - Inspect the editor’s value after query injection.
   - Ensure that the entire WarpScript appears as expected, matching a predefined script.


---

## Regression/Test Bed Scenario: Warp10 Request and Response Validation

This scenario provides comprehensive coverage of request parsing and response formatting for the Warp10 datasource in Grafana.  
It ensures robust handling of all Warp10 datasource request/response permutations, including value type support, macro parsing, empty/null series, and timestamp integrity.  
It is intended as both a regression suite and a test bed for data layer validation.

### Steps

1. **Format Coverage: Table, Scalar, Array, and GTS List**
   - Submit queries that return results in all supported formats:
      - Scalar GTS (single value)
      - Array and table format (multiple values)
      - List of GTS (with and without datapoints)
   - Assert that the response structure in each case matches expectations. Check frame types, data arrays, and table shape.

2. **Data Type Validation**
   - Submit separate requests for each value type supported by Warp10:
      - Integer (`int`)
      - Float (`float`)
      - String (`string`)
      - Boolean (`boolean`)
   - Confirm that each value type is correctly preserved in the backend response and rendered with correct JS types (number, string, boolean, etc.).

3. **Null and Empty Values**
   - Test with GTS time series that have no datapoints (simulate null/empty).
   - Ensure the API response includes empty arrays for such GTS and that no data values are present.

4. **Timestamp Conversion**
   - Submit GTS data with input timestamps in microseconds.
   - Ensure all response timestamps are converted and returned in milliseconds (Grafana-compatible).

5. **Response Model Structure**
   - For each response, inspect the returned JSON:
      - Confirm presence and correctness of `results.A.frames`
      - Check schema metadata (name, field types)
      - Assert that all value arrays are of consistent length and type
   - Log for each type of test and validate fields according to specification.

6. **Partial and Nested Responses**
   - Create responses containing both GTS with and without data, and nested data structures if supported.
   - Validate correct separation between filled and empty series, and proper handling of nested data (if applicable).
---

## Macros: WarpScript Macro Parsing, Payload Transmission & Error Handling

This scenario ensures that macros written with `<% ... %>` blocks are:

- Correctly injected into the editor and accepted as valid input
- Properly included, unescaped, in the outgoing JSON payload to the backend
- Appropriately flagged if invalid, with clear error propagation

### Steps

1. **Macro Injection and Payload Validation**
    - Inject a valid WarpScript macro using `<% ... %>` in the query editor.
    - Trigger query execution and intercept the outgoing `/api/ds/query` POST request.
    - Assert that the outgoing request payload includes the macro code, with no unexpected escaping or transformation.

2. **Negative Test: Invalid Macro Handling**
    - Inject a malformed macro (for example, a syntax error in the macro body).
    - Trigger the query and intercept the backend response.
    - Assert that the backend returns a clear error message indicating macro parsing or execution failure.
    - Confirm that the error status is not `200 OK`.

3. **Editor and Model Integrity**
    - For each test, confirm that the editor value matches the outgoing payload content exactly.
    - Validate that multiline and indented macros are handled correctly and maintain structure in transmission.

---

## Constants Scenario: Warp10 Constant Injection and Payload Validation

This scenario verifies that constants defined in the Warp10 datasource configuration are properly injected into queries, transmitted in the payload, and interpreted by the backend.  
It ensures the constant mechanism functions correctly and transparently from the UI to the backend query processor.

### Steps

1. **Datasource Creation with Constant**
    - Create a new Warp10 datasource using the Grafana UI.
    - Define a constant (`offset = 3000`) in the datasource settings.
    - Save and test the datasource connection.

2. **Query Editor Injection**
    - Create a new dashboard and open the panel editor.
    - Select the created Warp10 datasource.
    - Enter a query that uses the constant (`NOW $offset +`).

3. **Payload Capture and Verification**
    - Run the query and intercept the `/api/ds/query` POST request.
    - Assert that the outgoing payload includes the expected constant reference (`$offset`).
    - Confirm that the query executes successfully and no errors are returned.

4. **Cleanup**
    - Delete the test datasource after the test completes.

---

## Constants Scenario: Warp10 Fails Gracefully on Missing Constants

This scenario ensures that when a constant is referenced in a query but not defined in the Warp10 datasource configuration, a clear error is returned from the backend.  
It validates the plugin’s behavior in handling misconfigurations and missing variable references.

### Steps

1. **Datasource Creation Without Constants**
    - Create a new Warp10 datasource without defining any constants.
    - Save and test the datasource connection to ensure it is valid.

2. **Query Editor with Undefined Constant**
    - Open a new dashboard and access the panel editor.
    - Select the newly created datasource.
    - Enter a query referencing a non-existent constant (`NOW $not_defined +`).

3. **Execution and Error Handling**
    - Run the query and intercept both the request and response to `/api/ds/query`.
    - Assert that:
        - The response includes a detailed error message.
        - The `results.A.error` field is populated.
        - The status code is not `200 OK`.

4. **Cleanup**
    - Delete the test datasource after the test completes.

---


## Constant Variable Scenario: Warp10 Constant Variable Substitution

This scenario validates that **constant variables** defined in Grafana dashboards are correctly handled and substituted within Warp10 queries.  
It ensures that static values assigned to constants are properly propagated from UI configuration to outgoing backend requests.

### Steps

1. **Define Constant Variable**
   - Add a constant variable via Grafana dashboard variable settings.
   - Assign a static value (`myConstVar'= '42'`) to the variable.

2. **Query Construction with Constant**
   - Write a Warp10 query in the panel editor that uses the constant variable.
   - Verify that the UI and outgoing payload both substitute the constant's value correctly.

3. **Query Execution and Output Validation**
   - Execute the query.
   - Confirm the backend processes the substituted value and returns expected results.

---

## Interval Variable Scenario: Warp10 Interval Variable Handling

This scenario verifies the correct creation, usage, and propagation of **interval variables** within Warp10 queries in Grafana.  
It checks that dynamic time-based variables update queries and data outputs as expected.

### Steps

1. **Create Interval Variable**
   - Add an interval variable through Grafana dashboard settings.
   - Define interval options (`1m`, `5m`, `1h`).

2. **Integrate Interval in Query**
   - Use the interval variable in a Warp10 query in the panel editor.
   - Switch between different interval values and verify query updates.

3. **Validation of Results**
   - Execute queries for different intervals.
   - Ensure the backend request reflects the selected interval and output data changes accordingly.

---

## Query Variable Scenario: Warp10 Query Variable Integration

This scenario tests the behavior of **query-based variables** whose values are dynamically loaded from Warp10 datasource queries.  
It ensures variable value loading, selection, and correct propagation into panel queries.

### Steps

1. **Define Query Variable**
   - Configure a dashboard variable that loads its values from a Warp10 query.

2. **UI and Variable Value Selection**
   - Confirm that the variable selector lists the correct query results.
   - Select different variable values and observe UI updates.

3. **Query Execution with Variable**
   - Use the selected query variable in a panel query.
   - Check that outgoing backend requests reflect the selected value and output data is as expected.~~~~

---

## Custom Multi-Value Variable Scenario: Warp10 Custom Variable Multi-Value Integration

This scenario validates that **custom variables** in Grafana, when set to **multi-value**, are correctly expanded into lists and handled in outgoing Warp10 queries.  
It ensures values are serialized as arrays in the backend payload, the variable assignment structure is present, and each selected value appears in the request.

### Steps

1. **Define Multi-Value Custom Variable**
   - In the dashboard variables settings, add a new variable of type **Custom**.
   - Set values such as `sensorsA,sensorsB,sensorsC`.
   - Enable the **Multi-value** option.

2. **Use in Warp10 Query**
   - Reference the variable in a WarpScript query:
     ```warpscript
     '${sensors}' ',' SPLIT
     <%
       'sensor' STORE
       NEWGTS 'sensor' STORE
       $sensor 'sensor_id' RENAME
     %> FOREACH
     ```
   - This script will iterate over all selected values.

3. **Validate Query Payload**
   - Execute the panel query.
   - Assert that the outgoing payload contains:
     - The array: `[ 'sensorsA' 'sensorsB' 'sensorsC' ] 'sensors_list' STORE`
     - The assignment logic: `~' $sensors_list REOPTALT + 'sensors' STORE`
     - A FOREACH loop and that all sensors are present in the `expr`.

4. **Cleanup**
   - Remove the test datasource and dashboard.

---

## Datasource Healthcheck Scenario: Warp10 Datasource Health Validation

This scenario verifies the **healthcheck behavior** of the Warp10 datasource in Grafana. 
It confirms that status feedback is accurate and errors are correctly propagated for different connectivity situations.

### Steps

1. **Create and Test Datasource in Proxy Mode**
   - Create a new Warp10 datasource and save in **proxy** mode.
   - Validate that a successful health check is reported.

2. **Cleanup**
   - Delete the test datasource and confirm its removal.

---

## Editor JSON Model Scenario: Warp10 Query Editor Model Verification

This scenario validates the **Warp10 query editor’s behavior** in Grafana, ensuring the correct creation and retrieval of the internal JSON model for a panel, across multiple UI and Grafana versions.

### Steps

1. **Navigate to Dashboard Creation**
    - Open a new dashboard in Grafana.
    - (If required by the version) Enter dashboard edit mode.

2. **Add a New Panel**
    - Click the appropriate “Add” button (accounting for UI variations).
    - Select “Add new visualization” and proceed to the panel editor.

3. **Configure Panel**
    - Set the panel title to a test value (e.g., `Test Editor JSON`).
    - Enter a simple Warp10 query (e.g., `1 2 +`) into the editor.
    - (If required by the version) Select the correct datasource (`Warp10-Clever-Cloud`).

4. **Save and Inspect JSON Model**
    - Save the panel and open the panel JSON model.
    - Extract the JSON model using all compatible methods (Monaco, legacy textarea, etc.).

5. **Validate Content**
    - Programmatically verify the JSON model contains the test query (`"expr": "1 2 +"`) and the test title (`"title": "Test Editor JSON"`).

6. **Cleanup**
    - Discard or delete the test panel/dashboard to leave the environment clean.



