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
  'https://gbfs.bluebikes.com/gbfs/en/station_information.json';
const jsonData = await fetch(stationDataUrl).then((response) =>
  response.json(),
);
const stations = jsonData.data.stations;

// Fetch trip data
const tripDataUrl =
  'https://vis-society.github.io/labs/8/bluebikes-traffic-2024-03.csv';
const trips = await d3.csv(tripDataUrl, d3.autoType);

// Function to compute station traffic
function computeStationTraffic(stations, trips) {
  // Count departures per station
  const departures = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.start_station_id,
  );

  // Count arrivals per station
  const arrivals = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.end_station_id,
  );

  // Add traffic data to each station
  return stations.map((station) => {
    const dept = departures.get(station.station_id) || 0;
    const arr = arrivals.get(station.station_id) || 0;
    return {
      ...station,
      departures: dept,
      arrivals: arr,
      totalTraffic: dept + arr,
    };
  });
}

// Compute traffic for all stations
const stationsWithTraffic = computeStationTraffic(stations, trips);

// Create scale for circle radius
const radiusScale = d3
  .scaleSqrt()
  .domain([0, d3.max(stationsWithTraffic, (d) => d.totalTraffic)])
  .range([0, 20]);

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
    .attr('fill', 'steelblue')
    .attr('fill-opacity', 0.5)
    .attr('stroke', 'white')
    .attr('stroke-width', 1)
    .attr('cx', (d) => map.project([d.lon, d.lat]).x)
    .attr('cy', (d) => map.project([d.lon, d.lat]).y);

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
});

