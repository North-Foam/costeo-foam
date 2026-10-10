# Costeo integral · North Foam

Aplicación financiera adaptada del repositorio `linjorgeuribe-dev/costeo-foam`, revisión base `e9ad524`.

## Estado de esta entrega

La aplicación está publicada en `https://costeo.northfoamco.com` mediante Netlify y una base PostgreSQL en Neon. La versión compartida incluye usuarios y permisos, y recibió el respaldo de datos de la versión anterior. Vercel permanece como alternativa de alojamiento, pero no es el servicio de producción actual.

## Actualizaciones desde el repositorio de Jorge

La primera integración de esta rama debe revisarse y fusionarse en `main` de `linjorgeuribe-dev/costeo-foam`. Después, cambiar **el repositorio vinculado del mismo sitio de Netlify** a ese repositorio y elegir `main` como rama de producción. Conservar el proyecto Netlify existente, su dominio `costeo.northfoamco.com`, y las variables privadas `DATABASE_URL` y `APP_ORIGIN`. No crear una base Neon nueva ni volver a ejecutar la inicialización del administrador. Comprobar que la nueva publicación permita entrar con las cuentas actuales y muestre los datos existentes.

Desde esa integración, Jorge debe actualizar `public/model.js` para la interfaz y los cálculos, `server/` para la API y reglas de datos, y `netlify.toml` solo cuando cambie la configuración de despliegue. El antiguo `index.html` en la raíz ya no es el archivo servido por Netlify. Los cambios enviados a `main` se publicarán automáticamente; conviene prepararlos en una rama, revisar las pruebas y fusionarlos cuando estén listos. Un cambio de estructura de datos exige planear una migración de Neon antes de publicar la versión nueva.

## Funciones

- Cuentas individuales con contraseñas protegidas mediante scrypt y sal aleatoria.
- Sesiones de ocho horas, cookies HttpOnly, SameSite=Strict y Secure en producción; cierre e invalidación de sesiones.
- Administrador: usuarios, edición, importación, restablecimiento y gestión de periodos.
- Captura: lectura y edición; no puede borrar/cerrar/reabrir periodos ni modificar la captura de un periodo cerrado.
- Consulta: lectura y exportaciones; el servidor rechaza las escrituras.
- Contraseña temporal obligatoria en el primer acceso; recuperación mediante restablecimiento por un administrador. No incluye envío de correos de recuperación.
- Persistencia compartida con control de versión. Si otra persona guarda primero, se rechaza la sobrescritura y se ofrece respaldar los cambios pendientes y recargar.
- Registro de inicios de sesión, guardados y administración de usuarios, sin registrar contraseñas ni valores financieros.
- Exportaciones Excel, PDF y JSON; importación JSON exclusiva del administrador y validada en el servidor.
- Validación de solicitudes, protección de origen, límites de intentos de acceso y política de contenido que bloquea scripts en línea.

Se conservan las pantallas y el motor de cálculo original. La aplicación almacena un documento financiero compartido, no un libro contable transaccional. El cierre de periodo protege la captura mensual; no congela automáticamente una copia de todos los catálogos y fórmulas históricos. Los permisos son por rol para la aplicación completa, no por campo o departamento.

## Inicio limpio

Sin empleados, sueldos, costos indirectos, insertos, materiales, clientes ni capturas. Los parámetros comerciales y operativos se dejan vacíos o en cero; los factores de escenario comienzan neutrales (1; variación de margen 0). Se conservan nombres de centros/procesos y la conversión de semanas 52/12. El responsable debe configurar tipo de cambio, capacidad, cargas de nómina y márgenes antes de usar resultados operativos.

## Desarrollo local

Requiere Node.js 24 y npm.

1. `npm ci`
2. `npm run build`
3. Crear un archivo local `.env`, excluido de Git, con:

```dotenv
LOCAL_DATABASE=.local/database
APP_ORIGIN=http://localhost:3100
```

4. `npm run db:migrate`
5. Crear el primer administrador como se describe abajo.
6. `npm run dev` y abrir `http://localhost:3100`.

La base local es solo para desarrollo. Nunca configurar LOCAL_DATABASE en el alojamiento público.

## Pruebas

- `npm test`: autenticación, permisos, contraseñas, invalidación de sesiones, validación de datos, límites de acceso, concurrencia y motor de cálculo.
- `npm run test:browser`: navegación, captura, administración de usuarios, exportaciones y vista móvil; requiere Microsoft Edge instalado. Usa una base temporal independiente con cuentas aleatorias de prueba.
- Una prueba adicional compara los cálculos contra el commit original si la historia Git está disponible. En el ZIP esa comparación se omite; la prueba de resultados conocidos se mantiene.

## Vercel y Neon

1. Crear las cuentas de Vercel y Neon bajo control de North Foam. Para el uso empresarial se contempla Vercel Pro; Neon Free está sujeto a sus límites actuales.
2. Crear un proyecto PostgreSQL vacío en Neon. Elegir una región cercana a la función de Vercel. Obtener la conexión pooled privada.
3. Preparar un `.env` local privado con `DATABASE_URL` y `APP_ORIGIN`. La conexión usa TLS con verificación de certificado.
4. Ejecutar `npm run db:migrate`. La migración es idempotente y no reemplaza datos existentes.
5. Crear el primer administrador con el procedimiento siguiente.
6. Subir estos cambios a una rama del repositorio y revisarlos. La cuenta GitHub necesita permiso de escritura; conectar Vercel al repositorio autorizado.
7. Importar en Vercel. Framework: Other. Node.js: 24.x. Build: `npm run build`. Output: `public`. Install: `npm ci`. La configuración de funciones y rutas está en `vercel.json`.
8. Variables privadas de producción: `DATABASE_URL`, `APP_ORIGIN`. `BMX_TOKEN` es opcional y habilita la consulta de Banxico. No configurar ADMIN_PASSWORD como variable persistente en Vercel.
9. Inicialmente APP_ORIGIN debe ser el origen exacto HTTPS del despliegue que se usará, sin barra final. Cuando se active el dominio definitivo, cambiarlo a `https://costeo.northfoamco.com` y redesplegar. Las escrituras desde otros dominios serán rechazadas intencionalmente.
10. Usar una base o rama separada para previews; nunca copiar la conexión de producción a previews no controlados. Configurar el origen exacto del preview que se quiera probar.
11. Verificar en Vercel: iniciar sesión, cambiar contraseña temporal, crear usuario de Consulta, guardar/recargar una captura, rechazar edición de Consulta y comprobar conflictos entre dos sesiones.

## Netlify Free y Neon

Netlify Free admite proyectos comerciales sujetos a sus límites mensuales. Esta alternativa usa los mismos archivos de la app y la misma base Neon. La configuración está en `netlify.toml`; `netlify/functions/api.js` ejecuta el servidor Express.

1. Crear un sitio desde la rama GitHub que contiene esta versión. Si se usa una bifurcación, mantener el acceso al repositorio bajo control de North Foam.
2. Configurar build `npm run build`, carpeta publicada `public` y versión Node 24. El archivo `netlify.toml` ya define el build y la ruta de la API.
3. Crear una base vacía en Neon. Para inicializar desde un entorno privado local, ejecutar `npm run db:migrate` y `npm run admin:create` con la conexión de Neon. Como alternativa para el primer despliegue privado en Netlify, definir temporalmente `BOOTSTRAP_ADMIN=true`, `ADMIN_EMAIL`, `ADMIN_NAME` y `ADMIN_PASSWORD` (marcada como secreta) y volver a desplegar. El build ejecuta la migración y crea el primer administrador solo cuando `BOOTSTRAP_ADMIN=true`. Retirar esas cuatro variables inmediatamente después de verificar el éxito. Nunca poner la contraseña inicial en Git ni en el chat.
4. Configurar en Netlify las variables privadas `DATABASE_URL` y `APP_ORIGIN`. Para el primer despliegue, APP_ORIGIN debe ser el origen HTTPS exacto de la URL de Netlify que se utilizará, sin barra final. `BMX_TOKEN` es opcional.
5. No compartir la conexión de producción con despliegues de prueba de ramas o solicitudes de cambio. Revisar el alcance de las variables en Netlify.
6. Cuando el dominio esté validado, cambiar APP_ORIGIN a `https://costeo.northfoamco.com` y volver a publicar. Las escrituras desde otro origen serán rechazadas.
7. Verificar acceso, cambio de contraseña temporal, roles, guardado y exportaciones en el sitio publicado. El plan gratuito tiene límite de créditos mensuales; el servicio puede pausarse al agotarlos.

## Primer administrador

No hay credenciales predeterminadas ni una ruta pública de instalación.

Proporcionar temporalmente en el entorno privado local (o en `.env`, excluido de Git): `ADMIN_EMAIL`, `ADMIN_NAME` y `ADMIN_PASSWORD` (mínimo 12 caracteres). Ejecutar `npm run admin:create`. El programa solo permite crear el primer usuario si aún no existe ninguno y exige cambiar la contraseña al ingresar. Retirar después las tres variables del archivo/entorno.

Los siguientes usuarios se crean desde Acceso → Administrar usuarios. Para evitar pérdida de acceso, conviene que la empresa mantenga más de un administrador responsable. No enviar contraseñas por el repositorio ni incluirlas en documentación.

## Dominio existente

Dirección acordada: `costeo.northfoamco.com`.

El administrador del dominio comprado desde Google Workspace debe entrar a Cuenta → Dominios → Administrar dominios → Ver detalles para localizar el registrador y su consola DNS.

Agregar el dominio al proyecto de Vercel o Netlify y copiar el registro específico que ese proveedor solicite para el host `costeo`. Usualmente será CNAME y, si corresponde, verificación TXT. No usar un destino supuesto ni cambiar los servidores de nombres o los registros del correo. Verificar HTTPS y el estado de validación en el proveedor al terminar.

## Respaldo y límites

El botón Respaldar datos descarga el documento financiero en JSON; no incluye usuarios, contraseñas o bitácora. Antes de cambios relevantes, guardar un respaldo privado. Definir además respaldo completo de PostgreSQL y probar su restauración conforme a la operación de la empresa; esta entrega no automatiza un respaldo externo.

Para migrar un respaldo de la versión que guardaba en el navegador, ejecutar `node scripts/convert-legacy-backup.js respaldo.json convertido.json` fuera del repositorio y luego importar el archivo convertido desde una cuenta administradora. La conversión valida todos los campos, conserva los valores históricos `qDeseada`, `bloque` y `presupuesto.periodo`, y omite el PIN antiguo, que no debe usarse como credencial en la versión compartida. Las cantidades `qDeseada` quedan archivadas en la base; los reportes actuales de requerimientos usan los volúmenes capturados por periodo.

El servidor limita cada solicitud a 2 MB y aplica límites a las listas. La capacidad gratuita de Neon y el consumo de Vercel deben revisarse con el uso real. El registro de actividad crece con los guardados; no se ha aplicado borrado automático de historial.

## Estructura

- `public/`: interfaz y motor original adaptado; `vendor/` se genera al construir.
- `server/`: autenticación, permisos, esquema, validación y conexión PostgreSQL.
- `api/index.js`: entrada de Vercel; `netlify/functions/api.js`: entrada de Netlify.
- `scripts/`: preparación, migración, primer administrador y servidor local.
- `tests/`: verificaciones aisladas.

La versión original permanece en la historia de Git. No publicar `.env`, `.local`, pruebas exportadas o credenciales.

## Secciones de datos reales

- **Facturas de venta**: carga de XML CFDI y comparativo proyectado vs. facturado.
- **Producción y carga**: bitácora diaria de piezas, minutos y personas; compara tiempos reales contra la Ruta y calcula la carga de planta.
- **Cierre de mes**: al cerrar un periodo se congelan sus costos, precios, tipo de cambio y gastos fijos.
