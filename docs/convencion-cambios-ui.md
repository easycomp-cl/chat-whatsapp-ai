# Convención: documentar cambios en la UI

Cuando haya cambios en **`chat-whatsapp-ai-ui`** (repo hermano), crear o actualizar:

`chat-whatsapp-ai-ui/docs/cambios-ui-<tema-corto>.md`

## Contenido mínimo del MD

1. **Resumen** (qué ve el usuario)
2. **Archivos tocados** (tabla)
3. **Dependencias de deploy** (Supabase, backend ECS, Vercel, env vars)
4. **Cómo probar**

## Ejemplo

Ver `chat-whatsapp-ai-ui/docs/cambios-ui-estado-entrega-whatsapp.md`.

## Regla para el agente

El agente debe generar este MD al implementar o coordinar cambios de front, antes de cerrar la tarea.
