mapboxgl.accessToken =
  'pk.eyJ1Ijoic2htMDEwIiwiYSI6ImNtaHpsYjR1ODBvYmsya29zY24yY2p1djgifQ.j77_RBHQKDZkXfhvMprmqQ';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.0942, 42.3601],
  zoom: 12,
});

// Fetch BlueBikes station data
const stationDataUrl =
  'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
const jsonData = await fetch(stationDataUrl).then((response) =>
  response.json(),
);
const stations = jsonData.data.stations;

// Fetch trip data
const tripDataUrl =
  'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';
let trips = [];
try {
  trips = await d3.csv(tripDataUrl, d3.autoType);
  console.log('Loaded trips:', trips.length, 'trips');
  console.log('Sample trip:', trips[0]);
  console.log('Trip start_station_id type:', typeof trips[0].start_station_id);
  console.log('Trip start_station_id value:', trips[0].start_station_id);
} catch (error) {
  console.error('Failed to load trip data:', error);
}

// Pre-index trips by minute for performance
const departuresByMinute = Array.from({ length: 1440 }, () => []);
const arrivalsByMinute = Array.from({ length: 1440 }, () => []);

// Populate the minute-indexed arrays
for (let trip of trips) {
  // Parse date strings (format: '2024-03-20 08:18:13')
  const startDate = new Date(trip.started_at);
  const endDate = new Date(trip.ended_at);
  
  const startMinute = startDate.getHours() * 60 + startDate.getMinutes();
  const endMinute = endDate.getHours() * 60 + endDate.getMinutes();
  
  departuresByMinute[startMinute].push(trip);
  arrivalsByMinute[endMinute].push(trip);
}

// Function to retrieve trips efficiently by minute range
function filterByMinute(tripsByMinute, timeFilter) {
  if (timeFilter < 0) {
    return tripsByMinute.flat(); // All trips
  }

  // Get trips within +/- 30 minutes
  const minMinute = (timeFilter - 30 + 1440) % 1440;
  const maxMinute = (timeFilter + 30) % 1440;

  // Handle wrap-around at midnight
  if (minMinute > maxMinute) {
    let beforeMidnight = tripsByMinute.slice(minMinute);
    let afterMidnight = tripsByMinute.slice(0, maxMinute);
    return beforeMidnight.concat(afterMidnight).flat();
  } else {
    return tripsByMinute.slice(minMinute, maxMinute).flat();
  }
}

// Function to compute station traffic
function computeStationTraffic(stations, timeFilter = -1) {
  // Retrieve filtered trips efficiently from pre-indexed data
  const filteredDepartures = filterByMinute(departuresByMinute, timeFilter);
  const filteredArrivals = filterByMinute(arrivalsByMinute, timeFilter);

  // Count departures per station (using short_name which matches trip station IDs)
  const departures = d3.rollup(
    filteredDepartures,
    (v) => v.length,
    (d) => d.start_station_id,
  );

  // Count arrivals per station
  const arrivals = d3.rollup(
    filteredArrivals,
    (v) => v.length,
    (d) => d.end_station_id,
  );

  // Add traffic data to each station
  return stations.map((station) => {
    // Match using short_name field (e.g., 'B32006') which corresponds to station IDs in trips
    const dept = departures.get(station.short_name) || 0;
    const arr = arrivals.get(station.short_name) || 0;
    return {
      ...station,
      departures: dept,
      arrivals: arr,
      totalTraffic: dept + arr,
    };
  });
}

// Debug station IDs
console.log('Sample station.station_id type:', typeof stations[0].station_id);
console.log('Sample station.station_id value:', stations[0].station_id);
console.log('Sample station.short_name:', stations[0].short_name);

// Compute traffic for all stations (using default timeFilter = -1 for all times)
const stationsWithTraffic = computeStationTraffic(stations);
console.log('Stations loaded:', stations.length);
console.log('Stations with traffic:', stationsWithTraffic.length);
console.log('Sample station with traffic:', stationsWithTraffic[0]);
console.log('Max traffic:', d3.max(stationsWithTraffic, (d) => d.totalTraffic));

// Create scale for circle radius
const radiusScale = d3
  .scaleSqrt()
  .domain([0, d3.max(stationsWithTraffic, (d) => d.totalTraffic)])
  .range([0, 20]);

// Create scale for traffic flow (departure ratio)
const stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

// Create SVG overlay
const mapContainer = map.getCanvasContainer();
const svg = d3
  .select(mapContainer)
  .append('svg')
  .attr('width', '100%')
  .attr('height', '100%')
  .style('position', 'absolute')
  .style('top', 0)
  .style('left', 0);

function update() {
  // Update circle positions when map moves
  svg
    .selectAll('circle')
    .attr('cx', (d) => map.project([d.lon, d.lat]).x)
    .attr('cy', (d) => map.project([d.lon, d.lat]).y);
}

// Function to update scatter plot based on time filter
function updateScatterPlot(timeFilter) {
  // Use optimized pre-indexed data
  const filteredStations = computeStationTraffic(stations, timeFilter);

  // Update radius scale domain
  radiusScale.domain([0, d3.max(filteredStations, (d) => d.totalTraffic)]);

  // Update circles
  svg
    .selectAll('circle')
    .data(filteredStations)
    .join('circle')
    .transition()
    .duration(500)
    .attr('r', (d) => radiusScale(d.totalTraffic))
    .attr('cx', (d) => map.project([d.lon, d.lat]).x)
    .attr('cy', (d) => map.project([d.lon, d.lat]).y)
    .style('--departure-ratio', (d) =>
      stationFlow(d.departures / d.totalTraffic),
    );

  // Update tooltip with new data
  svg.selectAll('circle').on('mouseover', function (event, d) {
    const tooltip = d3.select('#tooltip');
    tooltip.classed('visible', true).html(`
      <strong>${d.name}</strong><br/>
      Departures: ${d.departures}<br/>
      Arrivals: ${d.arrivals}<br/>
      Total: ${d.totalTraffic}
    `);
  });
}

map.on('load', () => {
  map.addSource('boston-bike-lanes', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
  });

  map.addLayer({
    id: 'boston-bike-lanes',
    type: 'line',
    source: 'boston-bike-lanes',
    paint: {
      'line-color': [
        'match',
        ['get', 'ExisFacil'],
        'BIKE LANE',
        '#90EE90',
        'SEPARATED BIKE LANE',
        '#228B22',
        'BUFFERED BIKE LANE',
        '#32CD32',
        'CONTRAFLOW BIKE LANE',
        '#00FF00',
        'SHARED LANE',
        '#ADFF2F',
        '#00ff00',
      ],
      'line-width': 2,
    },
  });

  map.addSource('cambridge-bike-lanes', {
    type: 'geojson',
    data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson',
  });

  map.addLayer({
    id: 'cambridge-bike-lanes',
    type: 'line',
    source: 'cambridge-bike-lanes',
    paint: {
      'line-color': '#00ff00',
      'line-width': 2,
    },
  });

  // Add station markers
  const circles = svg
    .selectAll('circle')
    .data(stationsWithTraffic)
    .join('circle')
    .attr('r', (d) => radiusScale(d.totalTraffic))
    .attr('fill-opacity', 0.5)
    .attr('stroke', 'white')
    .attr('stroke-width', 1)
    .attr('cx', (d) => map.project([d.lon, d.lat]).x)
    .attr('cy', (d) => map.project([d.lon, d.lat]).y)
    .style('--departure-ratio', (d) =>
      stationFlow(d.departures / d.totalTraffic),
    );

  // Add tooltip functionality
  const tooltip = d3.select('#tooltip');

  circles
    .on('mouseover', function (event, d) {
      tooltip.classed('visible', true).html(`
        <strong>${d.name}</strong><br/>
        Departures: ${d.departures}<br/>
        Arrivals: ${d.arrivals}<br/>
        Total: ${d.totalTraffic}
      `);
    })
    .on('mousemove', function (event) {
      tooltip
        .style('left', event.pageX + 10 + 'px')
        .style('top', event.pageY + 10 + 'px');
    })
    .on('mouseout', function () {
      tooltip.classed('visible', false);
    });

  // Update positions on map movement
  map.on('move', update);
  map.on('zoom', update);

  // Add slider functionality
  const slider = d3.select('#time-slider');
  const timeLabel = d3.select('#time-label');

  slider.on('input', function () {
    const minutes = +this.value;

    // Update label
    if (minutes < 0) {
      timeLabel.text('All times');
    } else {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      const ampm = hours < 12 ? 'AM' : 'PM';
      const displayHours = hours % 12 || 12;
      timeLabel.text(
        `${displayHours}:${mins.toString().padStart(2, '0')} ${ampm}`,
      );
    }

    // Update visualization (to be implemented)
    updateScatterPlot(minutes);
  });
});

