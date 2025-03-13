# Clever Cloud Warp 10 Plugin

## Overview

The **Warp 10 Plugin** for Grafana allows querying and visualizing time-series data from a Warp 10 database.

## Install the plugin

You will need to restart your Grafana instance after the installation.

### Using grafana-cli

Install the plugin via Grafana CLI:

```bash
grafana cli plugins install clevercloud-warp10-datasource
```

### Cloning the repository

Just clone the repository in the Grafana plugins folder

```bash
git clone https://github.com/abocquierCC/clevercloud-warp10-datasource.git
```

## Configuration

1. Navigate to **Configuration** → **Data Sources**.
2. Click **Add data source** and select **Warp 10**.
3. Enter the Warp 10 endpoint (without `/api/v0/exec`).
4. Usage of 'proxy' mode is recommended (direct mode will be deprecated)
5. Save & Test the connection.

## Usage

- Use **WarpScript** queries in the **Query Editor** to fetch time-series data.
- Example Query:
  ```warpscript
  [ $start $end 'temperature' {} FETCH ]
  ```
- Customize **visualizations** using Grafana panels.

### Add execution variables

You can define variables at datasource level (~ organisation level) which can be available for all dashboards. you can
put tokens, constants, macros, ... In case of a macro definition, the variable value must start with <% and end with %>.
In the query you can prepend @ to the macro name to execute it.

For example, you can store a read token here:

![Usage of constants](/src/assets/readme/readme-const-usage.png)

### Make a query

On a new dashboard, in a Graph visualization, click on Query icon on the left side bar, and choose Warp10 datasource.

A text editor will appear. You can use the global variable you defined previously.

#### Graph example

The plugin look for GTS or GTS array in your stack, all other stack entry will be ignored.

![Make a query for time series](/src/assets/readme/readme-request-usage.png)

#### Table example

By default, the plugin build a table with the timestamp as the first column, and one column per GTS.

You can build custom tables instead of formating GTS array, if your result stack have only 1 element and this element
have columns and rows property. Then you can choose Table as Table transform in Table Options section

WarpScript™ example with the following request:

```
{
  'columns' [
    {
      'text' 'columnA'
      'type' 'number'
      'sort' true
      'desc' true
    }
    {
      'text' 'columnB'
      'type' 'number'
    }
  ]
  'rows' [
    [ 10 20 ]
    [ 100 200 ]
  ]
}
```

You got:

![Make a query for table](/src/assets/readme/readme-table-usage.png)

### Define Templating variables

You can make a WarpScript query to build the choice list of your templating variables. In the dashboard settings, select
Variables, and create a new one from a Query, with Warp10 as datasource. You can write any WarpScript in the Query field
to build your list of choices:

![Define templating variable](/src/assets/readme/readme-var-def-usage.png)

- If you let several values on the stack, each value will be added to the choice list.
- Best practice: Let a list on the stack. Each value will be added to the choice list.
- Best practice: Let a map on the stack. The map keys will be added to the choice list, the map values will be available
  within the panels WarpScript query. The values will be hidden from the dashboard user. This allows to hide complex
  values behind user-friendly labels.

Each value is transformed into two WarpScript variables you can use in your queries:

- A string, named as you named your variable.
- A list of strings, named as you named your variable, suffixed by _list.

![Defining variables](/src/assets/readme/readme-var-def-result-usage.png)

- If you do not use multiple selection, variable and variable_list will contain the currently selected value
- If you use multiple selection:
    - the string will contain an optimized WarpScript regular expression
    - the list will contain each element selected
- If you defined a custom all value and checked "All", variable and variable_list will contain your customized value.

### Query returning Labels

A variable can contain values for a defined Label. For example, to get all the unique values for the key hostname, you
can specify a query like this in the templating variable Query setting.

```warpscript
[ $ReadToken '~.*' { 'hostname' '~.*' } ] FIND
<% DROP LABELS 'hostname' GET %> LMAP
UNIQUE
```

You can also create nested variables. For example if you had another variable, for example $region. Then you could have
the hosts variable only show hosts from the current selected region with a query like this:

```warpscript
[ $ReadToken '~.*' { 'region' $region } ] FIND
<% DROP LABELS 'hostname' GET %> LMAP
UNIQUE
```

You can fetch keys for a given Class.

```warpscript
[ $ReadToken '<class_name>' { } ] FIND
<% DROP LABELS KEYLIST %> LMAP
FLATTEN
UNIQUE
```

### Templating variable evaluation

To understand the variable resolution, this is how a query is built

- Inject dashboard variables ($end, $interval, etc...)
- Inject datasource execution variables (Customized by datasource)
- Inject templating variables following the configuration order (a templating variable can call the previous templating
  variables in its resolution)
- Inject user query (can use all previous variables)

/!\ all the templating values are cast into strings by Grafana engine.

## Documentation

The complete documentation about Warp10 is available at https://www.warp10.io

## Contributing

If you're interested in contributing to the plugin project:

- [Contribute](https://github.com/CleverCloud/clevercloud-warp10-datasource/blob/main/CONTRIBUTING.md)
- [Report Bugs](https://github.com/CleverCloud/clevercloud-warp10-datasource/issues)

## License

This project is on the Apache-2.0 license,
see [LICENSE](https://github.com/CleverCloud/clevercloud-warp10-datasource/blob/main/LICENSE)