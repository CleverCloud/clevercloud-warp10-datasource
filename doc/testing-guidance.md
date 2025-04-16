# Testing Guidance

To test the **Clever Cloud Warp 10 Plugin**, follow these steps:

## 1. Installation via the provided script

Use the provided installation script to deploy the necessary environment. You must have **Docker Compose** installed to
run the script:

```bash
scripts/install_provisioning.sh
```

This script:

- Deploys a **Warp 10** instance via Docker.
- Sets up **Grafana** with the **Warp 10 plugin** installed.
- Provisions a test dashboard and data source to verify core functionalities.

### Other installation methods

Refer to the `README.md` for alternative installation methods.

## 2. Configuration

The Grafana provisioning system should automatically configure a data source from the `/provisioning/datasources` folder.

If manual configuration is necessary, follow these steps:

- Go to **Configuration → Data Sources** in Grafana.
- Add **Warp 10** as a new data source.
- Enter the Warp 10 endpoint (excluding `/api/v0/exec`). By default, the Warp 10 instance should listen on
  `http://host.docker.internal:8080`.
- Use **proxy mode**.
- Click **Save & Test**.

## 3. Usage

The Grafana provisioning system should automatically configure a test dashboard from the `/provisioning/dashboards` folder.

If manual configuration is necessary, follow these steps:

- Create a new dashboard and add a panel.
- Select the **Warp 10** data source.
- Use **WarpScript** queries in the Query Editor (see the `README.md` for examples and features).
- Example query:
```warpscript
[ 1 2 + ]
```

For detailed usage, templating variables, and advanced configurations, refer to
the [README.md](https://github.com/CleverCloud/clevercloud-warp10-datasource/blob/main/README.md).