# 📄 README - Metodología de Estimación de Humedad del Suelo (SM)

## 📌 Descripción general

Este script implementa una metodología multifuente para estimar la **humedad del suelo (Soil Moisture, SM)** utilizando datos satelitales y variables topográficas en un periodo multianual, con resolución 10 x 10 metros.

El modelo se ejecuta en Earth Engine sobre el asset de puntos de muestreo:

- `projects/ee-oasotob/assets/PtsSM`

Los puntos representan la ubicación aproximada, con un error estimado de hasta 100 metros, de parcelas del Proyecto Líneas de Infiltración impulsado por la empresa Agricien con el apoyo de la Federación de Cámaras de Ganaderos de Guanacaste y el Ministerio de Agricultura. Este proyecto busca disminuir los impactos de la sequía y utiliza conceptos desarrollados en el libro:

- Yeomans, Ken B.; Yeomans, P.A.(dec.). *Water for Every Farm - Yeomans Keyline Plan* (English Edition)

Y agrega capas de humedad del suelo y humedad superficial SMAP para cada año.

El resultado es un índice normalizado de humedad del suelo en el rango **[0 – 1]**, donde:

- **0 → seco**
- **1 → alta humedad**

---

## 🧠 Enfoque metodológico

La estimación de humedad se basa en la integración de variables físicas relacionadas con la retención de agua en el suelo:

| Variable | Fuente | Relación con humedad |
|----------|--------|---------------------|
| SAR (VV, VH) | Sentinel-1 | Sensible a humedad superficial |
| NDMI | Sentinel-2 | Contenido de agua en vegetación |
| NDVI | Sentinel-2 | Cobertura vegetal |
| Pendiente | SRTM | Influye en escorrentía |
| SMAP | NASA SMAP | Humedad superficial satelital |

---

## ⚙️ Flujo del proceso

### 1. 📍 Datos de entrada

- Puntos de muestreo (FeatureCollection)
- Periodo de análisis: **2020 – 2026**
- Región: buffer de 5 km alrededor de los puntos

---

### 2. ⛰️ Topografía

- Fuente: SRTM (`USGS/SRTMGL1_003`)
- Derivación:
  - Pendiente (`slope`)
- Normalización:
  slope → [0 – 1]

---

### 3. 📡 Procesamiento SAR (Sentinel-1)

- Polarizaciones: `VV`, `VH`
- Filtros:
  - Modo IW
  - Órbita descendente
- Aplicación de filtro speckle:
  `focal_mean` (30 m)

- Cálculo:
  SAR = (VV + VH) / 2

- Normalización:
  SAR → [0 – 1] usando `unitScale(-20, 0)`

---

### 4. 🌿 Procesamiento óptico (Sentinel-2)

- Filtro de nubes: < 20%
- Composición: mediana temporal

#### Índices calculados:

- **NDVI (vegetación):**
  NDVI = (B8 - B4) / (B8 + B4)

- **NDMI (humedad):**
  NDMI = (B8 - B11) / (B8 + B11)

- Ambos normalizados a:
  [0 – 1]

---

### 5. 🧮 Modelo de humedad del suelo

SM = (SAR * 0.5)
   + (NDMI * 0.3)
   + ((1 - NDVI) * 0.1)
   + ((1 - SLOPE) * 0.1)

---

### 6. 🌊 Integración SMAP

- Fuente: `NASA/SMAP/SPL4SMGP/008`
- Banda: `sm_surface`
- Normalización: `unitScale(0, 0.5)`
- Salida: `SMAP` en rango [0,1]

---

### 7. 📅 Análisis multianual

- Se ejecuta el modelo para cada año (2020–2026)
- Ventana temporal fija:
  15 marzo – 8 abril

---

### 8. 🗺️ Visualización

- Se agregan primero las capas `SM` y luego las capas `SMAP`
- Paleta unificada para `SM` y `SMAP` con rango normalizado común: **0 – 1**
- En el script se utiliza un selector de año para cargar solo el año seleccionado, lo que reduce significativamente el tiempo de despliegue de capas

- Se mantiene una capa de puntos de muestreo y un panel de leyenda permanente en el script

---

### 9. 📈 Serie temporal

- Se genera un gráfico de serie temporal para `SM_final`
- Reducer: media sobre la región de puntos

---

### 10. 📍 Muestreo espacial

- Extracción de valores de `SM_final` en los puntos
- Atributos exportados:
  - Año
  - Latitud
  - Longitud

---

### 11. 💾 Exportaciones

#### 📊 CSV
- Exporta la tabla de puntos muestreados como CSV

#### 🗺️ Mapas
- Resolución: 10 m
- Carpeta: `GEE_Humedad`

---

## 🚀 Uso

1. Cargar script en GEE
2. Verificar assets
3. Ejecutar
4. Exportar resultados

---

## ⚠️ Consideraciones

- Modelo semi-empírico
- Sensible a condiciones atmosféricas
- SMAP se usa como referencia adicional, no como parte del índice primario

---

## 🔧 Mejoras futuras

- Calibración con campo
- Machine Learning
- Integración climática

---

## Archivos incluidos

- `Soil_Moisture_Index.js` — script principal de Earth Engine
- `GEE_SM_Model.ipynb` — notebook adaptado con el flujo del modelo y visualización
