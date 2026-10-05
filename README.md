# PIF-SST

**Análisis de factores que influyen en el desempeño**

Aplicación web de La Movida de SST+ para consultar y aplicar la taxonomía PIF del **EI 3646, Research report: A proposed human factors performance influencing factors (PIFs) taxonomy, primera edición, agosto de 2026**.

## Estado actual

- Dominio: `pif.movidasst.com`
- Frontend estático para GitHub Pages.
- Taxonomía PIF cargada desde Supabase.
- 7 categorías.
- 38 PIF principales.
- 143 subfactores y ejemplos registrados.
- Evidencias previstas en Google Drive; Supabase conserva metadatos y enlaces.
- Los datos de casos están protegidos mediante RLS.

## Nombre visible

Usar siempre:

**PIF-SST**  
**Análisis de factores que influyen en el desempeño**

La sigla PIF corresponde al término técnico en inglés *Performance Influencing Factors*.

## Criterio técnico

PIF-SST sirve para clasificar y analizar hallazgos respaldados por evidencia. No sustituye una metodología de investigación de incidentes y la taxonomía no debe tratarse como una lista de chequeo para asignar causas.

## Evidencias

Carpeta raíz en Google Drive: `PIF`.

La aplicación web utilizará un Web App independiente de Google Apps Script para guardar archivos en Drive. Supabase no almacenará los archivos físicos.

## Seguridad

Nunca incluir claves `service_role` ni secretos privados en GitHub Pages. La clave publicable de Supabase es apta para cliente web y el acceso a datos privados depende de RLS y de la sesión autenticada.
