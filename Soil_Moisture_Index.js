// =====================================================
//1. DATOS
// =====================================================
var puntos = ee.FeatureCollection("projects/ee-oasotob/assets/ptsmuestreo");
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

// =====================================================
// 5. COLECCIÓN MULTIANUAL
// =====================================================
var coleccion = ee.ImageCollection.fromImages(
  years.map(modelo)
);

// =====================================================
// 6. VISUALIZACIÓN
// =====================================================
var vis = {
  min: 0,
  max: 1,
  palette: ['brown','yellow','blue']
};

var img2024 = coleccion.filter(ee.Filter.eq('year', 2024)).first();
years.getInfo().forEach(function(year) {

  var img = coleccion
    .filter(ee.Filter.eq('year', year))
    .first();

  Map.addLayer(img.select('SM_final'), vis, 'SM ' + year);

});
Map.centerObject(puntos, 9);
// Map.addLayer(img2024.select('SM_final'), vis, 'Humedad avanzada 2024');
Map.addLayer(puntos, {color:'black'}, 'Puntos');



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
// =====================================================
// 10. EXPORTAR MAPAS POR AÑO (TASKS)
// =====================================================

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
// 11. CARGAR DATOS
// ===============================
var pts = ee.FeatureCollection('projects/ee-oasotob/assets/PtsSMb'); // <-- CAMBIAR

Map.centerObject(pts, 10);

// ===============================
// 12. CONFIGURACIÓN
// ===============================
var years = ee.List([
  'val2020', 'val2021', 'val2022',
  'val2023', 'val2024', 'val2025', 'val2026'
]);

// 🔥 ESCALA AJUSTADA (VISIBLE)
var scaleX = ee.Number(0.01);
var maxBarHeight = ee.Number(0.02);
var barWidth = ee.Number(0.005);

// Colores
var colors = ee.List([
  '#1f77b4', '#2ca02c', '#ff7f0e',
  '#d62728', '#9467bd', '#8c564b', '#000000'
]);

// ===============================
// 13. MAX GLOBAL (CORREGIDO)
// ===============================
var maxList = ee.List(
  pts.reduceColumns({
    reducer: ee.Reducer.max().repeat(years.length()),
    selectors: years
  }).get('max')
);

// 🔥 valor único global
var maxGlobal = ee.Number(maxList.reduce(ee.Reducer.max()));

print('Max global:', maxGlobal);

// ===============================
// 14. FUNCIÓN CREAR GRÁFICOS
// ===============================
var createChart = function(feature) {

  var coords = feature.geometry().coordinates();
  var lon = ee.Number(coords.get(0));
  var lat = ee.Number(coords.get(1));

  // 🔥 OFFSET para separar del punto
  var baseLon = lon.add(0.01);

  // =======================
  // EJE BASE
  // =======================
  var baseLine = ee.Geometry.Rectangle([
    baseLon,
    lat,
    baseLon.add(scaleX.multiply(years.length())),
    lat.add(ee.Number(0.0005))
  ]);

  var baseFeature = ee.Feature(baseLine).set({
    style: {
      color: 'black',
      fillColor: 'black'
    }
  });

  // =======================
  // BARRAS
  // =======================
  var bars = ee.FeatureCollection(
    ee.List.sequence(0, years.length().subtract(1)).map(function(i) {

      i = ee.Number(i);
      var attr = years.get(i);

      var value = ee.Number(
        ee.Algorithms.If(
          feature.get(attr),
          feature.get(attr),
          0
        )
      );

      // 🔥 NORMALIZACIÓN (VISIBLE)
      var height = value.sqrt()
        .divide(maxGlobal.sqrt())
        .multiply(maxBarHeight);

      var xOffset = i.multiply(scaleX);

      var rect = ee.Geometry.Rectangle([
        baseLon.add(xOffset),
        lat,
        baseLon.add(xOffset).add(barWidth),
        lat.add(height)
      ]);

      return ee.Feature(rect).set({
        style: {
          color: colors.get(i),
          fillColor: colors.get(i),
          width: 1
        }
      });
    })
  );

  return bars.merge(ee.FeatureCollection([baseFeature]));
};

// ===============================
// 15. GENERAR
// ===============================
var allBars = pts.map(createChart).flatten();

// ===============================
// 16. VISUALIZACIÓN
// ===============================
Map.addLayer(allBars.style({
  styleProperty: 'style'
}), {}, 'Barras PRO visibles');

Map.addLayer(pts, {color: 'black'}, 'Puntos');

// ===============================
// 17. LEYENDA
// ===============================
var legend = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '8px'
  }
});

legend.add(ui.Label('Años', {fontWeight: 'bold'}));

var yearsList = years.getInfo();
var colorsList = colors.getInfo();

yearsList.forEach(function(y, i) {
  legend.add(
    ui.Panel([
      ui.Label('', {
        backgroundColor: colorsList[i],
        padding: '8px',
        margin: '0 4px 0 0'
      }),
      ui.Label(y)
    ], ui.Panel.Layout.Flow('horizontal'))
  );
});

Map.add(legend);

// ===============================
// DEBUG
// ===============================
print('Primer feature:', pts.first());