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

### 1. Una cuenta para enviar

**resend.com** — gratis hasta 3.000 correos al mes, que es de sobra. Crea la cuenta y copia la
**API key**.

Para que los correos salgan con dirección de la FECh y no de prueba, hay que verificar un dominio
en Resend. Mientras tanto salen desde `onboarding@resend.dev`, que funciona igual.

### 2. Los secretos en Replit

| Key | Value |
|---|---|
| `SUPABASE_SECRET_KEY` | la **Secret key** de Supabase (*Project Settings → API Keys → Secret keys*) |
| `RESEND_API_KEY` | la clave de Resend |
| `CORREO_REMITENTE` | `SPT FECh <spt@tudominio.cl>`, o se omite para usar el de prueba |
| `CORREOS_TOKEN` | una palabra secreta que inventes, para que nadie más dispare los envíos |

> La *Secret key* de Supabase va **solo acá**, en el servidor. Nunca en la página.
> Es la única llave que puede leer la base cuando el acceso esté cerrado con cuentas.

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

Si dice `"error": "Falta RESEND_API_KEY"`, el correo se armó pero no salió: falta el secreto.
Si `preparados` es 0, no había nada que contar — es lo esperado en una semana sin pendientes.

---

## Lo que hace falta para que sirvan

Los correos salen de los datos, así que dependen de que estén cargados:

1. **Correo de cada integrante** en la pestaña Equipo. Sin correo, no recibe.
2. **Encargados en los pasos**, no solo en el proyecto: el correo diario y el semanal se arman
   desde ahí.
3. **Plazos en los pasos**. Un paso sin fecha no aparece en ningún aviso.
4. **El primer designado de cada proyecto**, que es quien recibe las alertas de urgencia.
