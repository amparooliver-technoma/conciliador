# ConciliaFlow

Aplicacion web estatica para conciliar documentos mensuales contra un Excel de referencia.

## Privacidad

- Todo el procesamiento ocurre localmente en el navegador.
- Los archivos no se envian a GitHub ni a servidores externos.
- La referencia no esta incluida en el repositorio.
- No hay reglas, enlaces, proyectos ni asignaciones internas embebidas.

## Uso

1. Seleccionar un Excel de referencia.
2. Seleccionar un ZIP con archivos PDF, CSV o ambos.
3. Ejecutar la conciliacion.
4. Descargar el Excel generado.

La referencia puede guardarse opcionalmente en IndexedDB dentro del navegador actual.

## GitHub Pages

El workflow `.github/workflows/deploy-pages.yml` publica automáticamente cada cambio enviado a `main`.

URL esperada:

`https://amparooliver-technoma.github.io/conciliador/`

## Desarrollo

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

La salida estatica se genera en `dist/`.
