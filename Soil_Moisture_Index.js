// =====================================================
//1. DATOS
// =====================================================
var puntos = ee.FeatureCollection("projects/ee-oasotob/assets/PtsSM").map(function(feature) {
  function formatVal(field, label) {
    var value = feature.get(field);
    return ee.String(ee.Algorithms.If(
      ee.Algorithms.IsEqual(value, null),
      ee.String(label).cat('NA'),
      ee.String(ee.Algorithms.If(
        ee.Algorithms.IsEqual(value, ''),
        ee.String(label).cat('NA'),
        ee.String(label).cat(ee.Number(value).format('%.2f'))
      ))
    ));
  }

  return feature.set({
    'SM2020': formatVal('val2020', 'SM2020='),
    'SM2021': formatVal('val2021', 'SM2021='),
    'SM2022': formatVal('val2022', 'SM2022='),
    'SM2023': formatVal('val2023', 'SM2023='),
    'SM2024': formatVal('val2024', 'SM2024='),
    'SM2025': formatVal('val2025', 'SM2025='),
    'SM2026': formatVal('val2026', 'SM2026=')
  });
});
var years = ee.List.sequence(2020, 2026);
var region = puntos.geometry().buffer(5000);

// =====================================================
// 2. DEM Y PENDIENTE
// =====================================================
var dem = ee.Image("USGS/SRTMGL1_003");
var slope = ee.Terrain.slope(dem).rename('slope');

// =====================================================
// 3. FILTRO SPECKLE (SAR)
// =====================================================
function speckleFilter(img) {
  return img.focal_mean(30, 'circle', 'meters');
}

// =====================================================
// 4. MODELO PRINCIPAL
// =====================================================
function modelo(year) {

  year = ee.Number(year);
  var start = ee.Date.fromYMD(year, 3, 15);
  var end   = ee.Date.fromYMD(year, 4, 8);

  // -------------------------------
  // SENTINEL-1 (SAR)
  // -------------------------------
  var s1_raw = ee.ImageCollection("COPERNICUS/S1_GRD")
    .filterDate(start, end)
    .filterBounds(region)
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    .filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'))
    .select(['VV','VH'])
    .limit(20)
    .map(speckleFilter);

  // 🔥 PROMEDIO + RENOMBRE (FIX CLAVE)
  var s1 = s1_raw.mean().rename(['VV','VH']);

  var sar = s1.expression(
    '(VV + VH) / 2', {
      'VV': s1.select('VV'),
      'VH': s1.select('VH')
    }).rename('SAR');

  var sar_norm = sar.unitScale(-20, 0).clamp(0,1);

  // -------------------------------
  // SENTINEL-2 (ÓPTICO)
  // -------------------------------
  var s2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterDate(start, end)
    .filterBounds(region)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
    .median();

  var ndvi = s2.normalizedDifference(['B8','B4'])
               .rename('NDVI')
               .clamp(0,1);

  var ndmi = s2.normalizedDifference(['B8','B11'])
               .rename('NDMI')
               .clamp(0,1);

  // -------------------------------
  // TOPOGRAFÍA
  // -------------------------------
  var slope_norm = slope.unitScale(0, 30).clamp(0,1);

  // -------------------------------
  // MODELO FINAL
  // -------------------------------
  var sm = sar_norm.expression(
    '(SAR * 0.5) + (NDMI * 0.3) + ((1 - NDVI) * 0.1) + ((1 - SLOPE) * 0.1)', {
      'SAR': sar_norm,
      'NDMI': ndmi,
      'NDVI': ndvi,
      'SLOPE': slope_norm
    }).rename('SM_final');

  // 🔥 PROPIEDADES CORRECTAS PARA CHART
  return sm.addBands([ndvi, ndmi, slope])
           .set({
             'year': year,
             'system:time_start': start.millis()
           });
}

function modeloSMAP(year) {
  year = ee.Number(year);
  var start = ee.Date.fromYMD(year, 3, 15);
  var end = ee.Date.fromYMD(year, 4, 8);

  var smap = ee.ImageCollection('NASA/SMAP/SPL4SMGP/008')
    .filterDate(start, end)
    .filterBounds(region)
    .select('sm_surface')
    .mean()
    .unitScale(0, 0.5)
    .clamp(0, 1)
    .rename('SMAP');

  return smap.set({
    'year': year,
    'system:time_start': start.millis()
  });
}

// =====================================================
// 5. COLECCIÓN MULTIANUAL
// =====================================================
var coleccion = ee.ImageCollection.fromImages(
  years.map(modelo)
);
var smapCollection = ee.ImageCollection.fromImages(
  years.map(modeloSMAP)
);

// =====================================================
// 6. VISUALIZACIÓN
// =====================================================
var vis = {
  min: 0,
  max: 1,
  palette: ['#d7191c', '#e85b3b', '#f99d59', '#fec980', '#ffedaa', '#ecf7b9', '#c7e8ad', '#9dd3a6', '#64abb0', '#2b83ba']
};

var smapVis = {
  min: 0,
  max: 1,
  palette: ['#d7191c', '#e85b3b', '#f99d59', '#fec980', '#ffedaa', '#ecf7b9', '#c7e8ad', '#9dd3a6', '#64abb0', '#2b83ba']
};

var yearSelector = ui.Select({
  items: years.getInfo().map(function(y) { return y.toString(); }),
  value: '2026',
  placeholder: 'Seleccionar año',
  onChange: updateMapYear
});

function updateMapYear(year) {
  if (!year) return;
  var selectedYear = parseInt(year, 10);
  Map.layers().reset();

  var smapImg = smapCollection.filter(ee.Filter.eq('year', selectedYear)).first();
  Map.addLayer(smapImg.select('SMAP'), smapVis, 'SMAP ' + year);

  var img = coleccion.filter(ee.Filter.eq('year', selectedYear)).first();
  Map.addLayer(img.select('SM_final'), vis, 'SM ' + year);

  Map.addLayer(puntos, {color: 'black'}, 'Puntos');
  Map.centerObject(puntos, 9);
}

var selectorPanel = ui.Panel([
  ui.Label('Año de visualización'),
  yearSelector
], ui.Panel.Layout.Flow('vertical'), {
  position: 'top-right',
  padding: '8px',
  backgroundColor: 'ffffffcc'
});
Map.add(selectorPanel);
Map.setOptions('HYBRID');
updateMapYear('2026');
Map.centerObject(puntos, 9);
// Map.addLayer(img2024.select('SM_final'), vis, 'Humedad avanzada 2024');



// =====================================================
// 7. GRÁFICO (YA FUNCIONA)
// =====================================================
var chart = ui.Chart.image.series({
  imageCollection: coleccion.select('SM_final'),
  region: puntos.geometry(),
  reducer: ee.Reducer.mean(),
  scale: 10
}).setOptions({
  title: 'Serie temporal humedad del suelo',
  lineWidth: 2,
  pointSize: 4
});

print(chart);

// =====================================================
// 8. EXTRACCIÓN DE DATOS
// =====================================================
var muestras = coleccion.map(function(img) {

  var year = img.get('year');

  var sampled = img.sampleRegions({
    collection: puntos,
    scale: 10,
    geometries: true
  });

  return sampled.map(function(f) {
    var coords = f.geometry().coordinates();

    return f.set({
      year: year,
      lon: coords.get(0),
      lat: coords.get(1)
    });
  });

}).flatten();

// =====================================================
// 9. EXPORTACIÓN
// =====================================================
Export.table.toDrive({
  collection: muestras,
  description: 'SM_Experto_FINAL',
  fileFormat: 'CSV'
});
// ===============================
// 10. EXPORTAR MAPAS POR AÑO (TASKS)
// ===============================

years.getInfo().forEach(function(year) {

  var img = coleccion
    .filter(ee.Filter.eq('year', year))
    .first()
    .select('SM_final');

  Export.image.toDrive({
    image: img,
    description: 'SM_' + year,
    folder: 'GEE_Humedad',
    fileNamePrefix: 'SM_' + year,
    region: region,
    scale: 10,
    maxPixels: 1e13
  });

});

// ===============================
// 11. CARGAR DATOS DE PUNTOS
// ===============================
Map.centerObject(puntos, 10);
Map.addLayer(puntos, {color: 'black'}, 'Puntos');

// ===============================
// LEYENDA DE COLORES
// ===============================
var legend = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '8px',
    backgroundColor: 'white',
    width: 'auto',
    minWidth: '140px'
  }
});

legend.add(ui.Label('Soil Moisture Index', {fontWeight: 'bold', fontSize: '10px'}));

var legendItems = [
  {color: '#d7191c', label: '<= 0.15'},
  {color: '#e85b3b', label: '0.15 - 0.2476'},
  {color: '#f99d59', label: '0.2476 - 0.2838'},
  {color: '#fec980', label: '0.2838 - 0.3092'},
  {color: '#ffedaa', label: '0.3092 - 0.3302'},
  {color: '#ecf7b9', label: '0.3302 - 0.3497'},
  {color: '#c7e8ad', label: '0.3497 - 0.3697'},
  {color: '#9dd3a6', label: '0.3697 - 0.3933'},
  {color: '#64abb0', label: '0.3933 - 0.4318'},
  {color: '#2b83ba', label: '> 0.4318'}
];

legendItems.forEach(function(item) {
  var row = ui.Panel([
    ui.Label('', {
      backgroundColor: item.color,
      padding: '8px',
      margin: '0 6px 0 0'
    }),
    ui.Label(item.label, {fontSize: '8px'})
  ], ui.Panel.Layout.Flow('horizontal'));
  legend.add(row);
});

Map.add(legend);

var titlePanel = ui.Panel({
  style: {
    position: 'bottom-center',
    padding: '6px 10px',
    backgroundColor: 'rgba(255,255,255,0.8)',
    textAlign: 'center'
  }
});

titlePanel.add(ui.Label('Guanacaste Humedad del Suelo', {fontWeight: 'bold', fontSize: '12px'}));
titlePanel.add(ui.Label('15 marzo-04 abril 2020-2026', {fontSize: '10px'}));

Map.add(titlePanel);

// ===============================
// DEBUG
// ===============================
print('Primer feature:', puntos.first());