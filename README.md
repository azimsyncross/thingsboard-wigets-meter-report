# ThingsBoard Custom Widget - Data Table with Date Range Filter and Pagination

This custom widget for ThingsBoard allows users to view energy, voltage, and current data over a specified date range. The widget features a date range picker, data-fetch button, loading indicators, paginated table view, and error handling. Below is an explanation of each major component and function used in this widget.

## Table of Contents
- [HTML Structure](#html-structure)
- [JavaScript Logic](#javascript-logic)
  - [Initialization (`onInit` function)](#initialization-oninit-function)
  - [Helper Functions](#helper-functions)
  - [Data Fetching (`callApi` function)](#data-fetching-callapi-function)
  - [Data Transformation (`transformData` function)](#data-transformation-transformdata-function)
  - [Custom Fork Join (`customForkJoin` function)](#custom-fork-join-customforkjoin-function)

---

### HTML Structure

The HTML section defines the structure of the widget. The layout includes:
- **Date Picker & Controls**: Allows users to select start and end dates for filtering data.
- **Fetch Data Button**: Triggers data retrieval for the selected date range.
- **Loading Spinner**: Displays a spinner while data is being fetched.
- **Data Table**: Displays fetched data with columns for energy, voltage, and current readings.
- **Pagination**: Allows users to navigate through data pages.
- **No Data Message**: Informs users when no data is available for the selected date range.

---

### JavaScript Logic

The JavaScript logic handles widget initialization, data retrieval, transformation, and rendering.

#### Initialization (`onInit` function)

The `onInit` function initializes the widget and sets up variables, column definitions, pagination, and display functions.

```javascript
self.onInit = function() {
    const $scope = self.ctx.$scope;

    // Initialize dates to yesterday and today
    $scope.startDate = new Date(moment(new Date()).subtract(1, 'days').format('YYYY-MM-DD 00:00:00'));
    $scope.endDate = new Date();

    // Set initial states and properties
    $scope.isLoading = false;
    $scope.columnDefs = [ /* column configuration here */ ];
    $scope.displayedColumns = $scope.columnDefs.map(col => col.field);
    $scope.pageSize = 10;
    $scope.currentPage = 0;
    $scope.totalItems = 0;

    // Initial data fetch
    $scope.callApi();
};
```

- **Parameters**: None.
- **Usage**: Initializes necessary states and default values for date range, column definitions, pagination, and calls `callApi` to fetch initial data.

#### Helper Functions

These helper functions assist in managing data display, pagination, and formatting.

1. **`formatValue`**:
   - Adds a unit to each numeric value and formats it to two decimal places.
   - **Parameters**:
     - `value` - The numeric value to be formatted.
     - `unit` - The unit (e.g., "A", "V", "kWh") to append.
   - **Usage**:
     ```javascript
     $scope.formatValue = function(value, unit) {
         return `${parseFloat(value).toFixed(2)} ${unit}`;
     };
     ```

2. **`handlePageChange`**:
   - Updates the `currentPage` value when the user changes pages.
   - **Parameters**:
     - `page` - The new page index.
   - **Usage**:
     ```javascript
     $scope.handlePageChange = function(page) {
         $scope.currentPage = page;
         self.ctx.detectChanges();
     };
     ```

3. **`getPaginatedData`**:
   - Retrieves the data to be displayed on the current page.
   - **Parameters**: None.
   - **Usage**:
     ```javascript
     $scope.getPaginatedData = function() {
         if (!$scope.dataSource) return [];
         const start = $scope.currentPage * $scope.pageSize;
         const end = start + $scope.pageSize;
         return $scope.dataSource.slice(start, end);
     };
     ```

#### Data Fetching (`callApi` function)

The `callApi` function fetches data within the selected date range. It performs asynchronous requests to gather aggregate data (`SUM`, `MAX`, `MIN`) for energy, voltage, and current readings.

```javascript
$scope.callApi = function() {
    $scope.isLoading = true;
    let startTs = $scope.startDate.getTime();
    let endTs = $scope.endDate.getTime();

    // Build API request URLs
    let rootApi = `/api/plugins/telemetry/${self.ctx.data[0].datasource.entityType}/${self.ctx.data[0].datasource.entityId}/values/timeseries?startTs=${startTs}&endTs=${endTs}&interval=3600000`;
    let reqSum = self.ctx.http.get(`${rootApi}&keys=energy&agg=SUM`);
    let reqMax = self.ctx.http.get(`${rootApi}&keys=voltage,current&agg=MAX`);
    let reqMin = self.ctx.http.get(`${rootApi}&keys=voltage,current&agg=MIN`);

    // Execute API calls and transform data on success
    customForkJoin({ sum: reqSum, max: reqMax, min: reqMin }).then(results => {
        $scope.dataSource = transformData(results);
        $scope.totalItems = $scope.dataSource.length;
        $scope.isLoading = false;
        self.ctx.detectChanges();
    }).catch(error => {
        console.error('Error fetching data:', error);
        $scope.isLoading = false;
        self.ctx.detectChanges();
    });
};
```

- **Parameters**: None.
- **Usage**: Called when the user clicks "Fetch Data". Fetches and processes data based on selected date range.

#### Data Transformation (`transformData` function)

The `transformData` function organizes the raw API response data into a structured format for the table.

```javascript
function transformData(data) {
    const transformedData = [];

    function getValue(dataList) {
        const result = {};
        dataList.forEach(item => {
            result[item.ts] = parseFloat(item.value);
        });
        return result;
    }

    // Extract data from API response
    const sumEnergy = getValue(data.sum.energy || []);
    const maxVoltage = getValue(data.max.voltage || []);
    const maxCurrent = getValue(data.max.current || []);
    const minVoltage = getValue(data.min.voltage || []);
    const minCurrent = getValue(data.min.current || []);

    // Generate structured data
    const timestamps = Object.keys(sumEnergy).filter(ts => 
        maxVoltage[ts] !== undefined &&
        maxCurrent[ts] !== undefined &&
        minVoltage[ts] !== undefined &&
        minCurrent[ts] !== undefined
    ).sort((a, b) => b - a);

    timestamps.forEach(ts => {
        transformedData.push({
            ts: moment(parseInt(ts)).format('YYYY-MM-DD HH:mm:ss'),
            total_energy: sumEnergy[ts].toFixed(2),
            min_current: minCurrent[ts].toFixed(2),
            max_current: maxCurrent[ts].toFixed(2),
            min_voltage: minVoltage[ts].toFixed(2),
            max_voltage: maxVoltage[ts].toFixed(2)
        });
    });

    return transformedData;
}
```

- **Parameters**:
  - `data` - API response object containing aggregated values.
- **Usage**: Organizes raw data into rows for the table, with timestamp and other fields.

#### Custom Fork Join (`customForkJoin` function)

This function executes multiple asynchronous requests and gracefully handles errors.

```javascript
function customForkJoin(requests) {
    const promises = Object.entries(requests).map(([key, request]) => {
        return new Promise((resolve) => {
            request.subscribe({
                next: (value) => resolve({ key, value }),
                error: (err) => resolve({ key, error: err })
            });
        });
    });

    return new Promise((resolve) => {
        Promise.all(promises).then((results) => {
            const response = {};
            results.forEach(({ key, value, error }) => {
                response[key] = error || value;
            });
            resolve(response);
        });
    });
}
```

- **Parameters**:
  - `requests` - An object with key-value pairs, where each value is an API request.
- **Usage**: Executes all API requests simultaneously and captures responses for further processing.

---

### License

This project is licensed under the MIT License.