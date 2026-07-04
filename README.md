# 📄 README - Metodología de Estimación de Humedad del Suelo (SM)

## 📌 Descripción general

Este script implementa una metodología multifuente para estimar la **humedad del suelo (Soil Moisture, SM)** utilizando datos satelitales y variables topográficas en un periodo multianual.

Visor Geografico link:  https://api-project-732156244341.projects.earthengine.app/view/soil-moisture-index

El modelo combina información de:

- Radar (Sentinel-1)
- Óptico (Sentinel-2)
- Topografía (SRTM)

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
  focal_mean (30 m)

- Cálculo:
  SAR = (VV + VH) / 2

- Normalización:
  SAR → [0 – 1] usando unitScale(-20, 0)

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

### 6. 📅 Análisis multianual

- Se ejecuta el modelo para cada año (2020–2026)
- Ventana temporal fija:
  15 marzo – 8 abril

---

### 7. 🗺️ Visualización

- Paleta:
  - Marrón → seco
  - Amarillo → intermedio
  - Azul → húmedo

---

### 8. 📈 Serie temporal

Se genera un gráfico con la evolución temporal de la humedad.

---

### 9. 📍 Muestreo espacial

- Extracción de valores en puntos
- Atributos:
  - Año
  - Latitud
  - Longitud

---

### 10. 💾 Exportaciones

#### 📊 CSV
Incluye variables y coordenadas.

#### 🗺️ Mapas
- Resolución: 10 m
- Carpeta: `GEE_Humedad`

---

## 🚀 Uso

1. Cargar script en GEE   https://code.earthengine.google.com/d8be564a00eff55d3072ceda751f3f6a
2. Verificar assets
3. Ejecutar
4. Exportar resultados

---

## ⚠️ Consideraciones

- Modelo semi-empírico
- Sensible a condiciones atmosféricas

---

## 🔧 Mejoras futuras

- Calibración con campo
- Machine Learning
- Integración climática
  
---

## Se adjunta un Jupyter Notebook y archivo script javascript GEE code.
