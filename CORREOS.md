# Correos automáticos

Cuatro envíos pensados para que nadie tenga que entrar a la aplicación para enterarse de lo suyo.
**Ninguno manda correos vacíos**: si una persona no tiene nada, no recibe nada.

| Envío | Cuándo | A quién | Qué lleva |
|---|---|---|---|
| `diario` | Cada mañana | A cada persona, solo si tiene algo hoy | Reuniones de hoy, lo que vence hoy, hitos, y lo atrasado |
| `semanal` | Lunes temprano | A cada persona | Su semana completa: reuniones, plazos, hitos, atrasos y los proyectos que lleva como principal |
| `urgencias` | Dos o tres veces por semana | Al encargado principal | Proyectos marcados urgentes que están atrasados o que ni siquiera tienen pasos definidos |
| `resumen` | Viernes en la tarde | A todo el equipo | Porcentaje de pasos completados, cuántos se cerraron en la semana, carga por persona, proyectos sin encargado y lo más atrasado |

Cada persona puede apagar los que no quiera: en la tabla `integrantes`, el campo `avisos`
acepta `{"diario": false}` y equivalentes.

---

## Ver los correos antes de enviarlos

Con la aplicación publicada, abre en el navegador:

```
https://tu-app.replit.app/api/correos/ver?tipo=semanal
```

Muestra exactamente lo que recibiría cada persona, **sin enviar nada**. Cambia `semanal` por
`diario`, `urgencias` o `resumen`. Es la forma de probar sin molestar a nadie.

---

## Encender el envío

### 1. Desde qué correo salen

Dos caminos. El sistema usa Gmail si está configurado; si no, Resend.

#### Opción A — Gmail de la FECh (recomendada si no tienen dominio propio)

Los correos salen desde la cuenta de Gmail de la Federación, con esa dirección de remitente.
No hay que verificar dominios ni nada.

1. Entra a la **cuenta de Google de la FECh** → *Gestionar tu cuenta* → **Seguridad**.
2. Activa la **verificación en dos pasos** si no está (es requisito).
3. Busca **Contraseñas de aplicaciones**, crea una llamada `SPT` y copia los 16 caracteres.
   **No es la contraseña normal de la cuenta**: es una clave aparte que se puede revocar.
4. Límite: 100 correos al día con Gmail normal, 1.500 con Workspace. La secretaría manda
   unos 30 a la semana.

#### Opción B — Resend (si la FECh tiene dominio propio)

1. Crea la cuenta en **resend.com**, gratis hasta 3.000 correos al mes.
2. **Sin dominio verificado, Resend sólo deja enviar a tu propia dirección**, la de la cuenta.
   Sirve para probar, no para el equipo.
3. Para mandarle a todos hay que verificar un dominio (agregar unos registros DNS). Después
   los correos salen desde algo como `spt@fech.cl`, que se ve mejor.

### 2. Los secretos en Replit

Siempre estos dos:

| Key | Value |
|---|---|
| `SUPABASE_SECRET_KEY` | la **Secret key** de Supabase (*Project Settings → API Keys → Secret keys*) |
| `CORREOS_TOKEN` | una palabra secreta que inventes, para que nadie más dispare los envíos |

Y según el camino elegido:

| Opción | Keys |
|---|---|
| Gmail | `GMAIL_USUARIO` (la dirección completa) y `GMAIL_APP_PASSWORD` (los 16 caracteres) |
| Resend | `RESEND_API_KEY`, y `CORREO_REMITENTE` si ya tienes dominio verificado |

> La *Secret key* de Supabase y la contraseña de aplicación van **solo acá**, en el servidor.
> Nunca en la página ni en GitHub.

### 3. Programar los horarios

En Replit: **Deployments → Scheduled**. Crea uno por cada envío, con el comando:

```bash
curl -X POST "https://tu-app.replit.app/api/correos/enviar?tipo=semanal&clave=TU_CORREOS_TOKEN"
```

Horarios recomendados (hora de Chile):

| Envío | Cuándo |
|---|---|
| `diario` | Lunes a viernes, 07:30 |
| `semanal` | Lunes, 08:00 |
| `urgencias` | Martes y jueves, 09:00 |
| `resumen` | Viernes, 18:00 |

Si prefieres no usar los horarios de Replit, sirve cualquier servicio gratuito de cron que llame
a esa misma dirección.

---

## Cómo saber si funcionó

La dirección de envío responde con un resumen:

```json
{ "tipo": "semanal", "preparados": 4, "enviados": 4 }
```

El campo `via` dice por dónde salieron: `gmail` o `resend`.
Si responde que no hay forma de enviar configurada, el correo se armó pero no salió: faltan los
secretos del paso 2.
Si `preparados` es 0, no había nada que contar — es lo esperado en una semana sin pendientes.

---

## Lo que hace falta para que sirvan

Los correos salen de los datos, así que dependen de que estén cargados:

1. **Correo de cada integrante** en la pestaña Equipo. Sin correo, no recibe.
2. **Encargados en los pasos**, no solo en el proyecto: el correo diario y el semanal se arman
   desde ahí.
3. **Plazos en los pasos**. Un paso sin fecha no aparece en ningún aviso.
4. **El primer designado de cada proyecto**, que es quien recibe las alertas de urgencia.
