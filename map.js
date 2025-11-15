mapboxgl.accessToken =
  'pk.eyJ1Ijoic2htMDEwIiwiYSI6ImNtaHpsYjR1ODBvYmsya29zY24yY2p1djgifQ.j77_RBHQKDZkXfhvMprmqQ';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.0942, 42.3601],
  zoom: 12,
});

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
});

