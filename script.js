self.onInit = function() {
    const $scope = self.ctx.$scope;
    
    // Initialize dates and state
    $scope.startDate = new Date(moment(new Date()).subtract(1, 'days').format('YYYY-MM-DD 00:00:00'));
    $scope.endDate = new Date();
    $scope.isLoading = false;
    $scope.columnDefs = [
        { field: 'ts', header: 'Timestamp' },
        { field: 'min_current', header: 'Min Current', unit: 'A' },
        { field: 'max_current', header: 'Max Current', unit: 'A' },
        { field: 'min_voltage', header: 'Min Voltage', unit: 'V' },
        { field: 'max_voltage', header: 'Max Voltage', unit: 'V' },
        { field: 'total_energy', header: 'Total Energy', unit: 'kWh' }
    ];
    
    // displayedColumns should now be derived from columnDefs
    $scope.displayedColumns = $scope.columnDefs.map(col => col.field);
    // Add pagination
    $scope.pageSize = 10;
    $scope.currentPage = 0;
    $scope.totalItems = 0;
    
    // Format display values
    $scope.formatValue = function(value, unit) {
        return `${parseFloat(value).toFixed(2)} ${unit}`;
    };
    
    // Handle page changes
    $scope.handlePageChange = function(page) {
        $scope.currentPage = page;
        self.ctx.detectChanges();
    };
    
    // Get paginated data
    $scope.getPaginatedData = function() {
        if (!$scope.dataSource) return [];
        const start = $scope.currentPage * $scope.pageSize;
        const end = start + $scope.pageSize;
        return $scope.dataSource.slice(start, end);
    };
    
    // Fetch data function with loading state
    $scope.callApi = function() {
        $scope.isLoading = true;
        let startTs = $scope.startDate.getTime();
        let endTs = $scope.endDate.getTime();
        
        let rootApi = `/api/plugins/telemetry/${self.ctx.data[0].datasource.entityType}/${self.ctx.data[0].datasource.entityId}/values/timeseries?startTs=${startTs}&endTs=${endTs}&interval=3600000`;
        
        let reqSum = self.ctx.http.get(`${rootApi}&keys=energy&agg=SUM`);
        let reqMax = self.ctx.http.get(`${rootApi}&keys=voltage,current&agg=MAX`);
        let reqMin = self.ctx.http.get(`${rootApi}&keys=voltage,current&agg=MIN`);
        
        customForkJoin({
            sum: reqSum,
            max: reqMax,
            min: reqMin
        }).then(results => {
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
    
    // Initial data fetch
    $scope.callApi();
}

// Keep your existing customForkJoin function

function transformData(data) {
    const transformedData = [];
    
    function getValue(dataList) {
        const result = {};
        dataList.forEach(item => {
            result[item.ts] = parseFloat(item.value);
        });
        return result;
    }
    
    const sumEnergy = getValue(data.sum.energy || []);
    const maxVoltage = getValue(data.max.voltage || []);
    const maxCurrent = getValue(data.max.current || []);
    const minVoltage = getValue(data.min.voltage || []);
    const minCurrent = getValue(data.min.current || []);
    
    const timestamps = Object.keys(sumEnergy).filter(ts => 
        maxVoltage[ts] !== undefined &&
        maxCurrent[ts] !== undefined &&
        minVoltage[ts] !== undefined &&
        minCurrent[ts] !== undefined
    ).sort((a, b) => b - a); // Sort timestamps in descending order
    
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