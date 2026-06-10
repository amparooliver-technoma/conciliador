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

## Seguridad de dependencias

- `package-lock.json` fija todas las versiones directas y transitivas.
- Las dependencias directas y los overrides usan versiones exactas, sin rangos `^` o `~`.
- `.npmrc` configura `min-release-age=3`, por lo que npm 11 no resolverá versiones publicadas hace menos de tres días.
- `.npmrc` deshabilita scripts de instalación de dependencias por defecto.
- `npm run security:age` verifica la fecha de publicación de cada dependencia bloqueada y falla de forma cerrada.
- GitHub Actions ejecuta la verificación de antigüedad, `npm ci --ignore-scripts` y `npm audit` antes de compilar o desplegar.

Usar npm `11.16.0`, fijado mediante `packageManager`, para que la política de antigüedad se aplique localmente.

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
