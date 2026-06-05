# Deploy a la web (Vercel + GitHub)

Pasos para que la app quede online en un link tipo `precios-bimbo.vercel.app` y se actualice sola 2 veces por día.

## Resumen del flujo

```
GitHub Actions corre cada 12hs
   ↓ ejecuta el scraping
   ↓ commitea los archivos (CSV, JSON, PDF) al repo
Vercel detecta el commit y redeployea la web (5 segundos, gratis)
   ↓
Tu compañero entra al link y ve la última info
```

## 1) Subir el código a GitHub (una vez)

1. Crear cuenta en [github.com](https://github.com) si no tenés.
2. Crear un repo nuevo (puede ser **privado** si no querés que sea público):
   - Click en "+" arriba a la derecha → "New repository"
   - Nombre: `precios-bimbo` (o el que quieras)
   - **No** tildes "Add a README" — el repo va vacío
   - Click "Create repository"
3. En GitHub te muestra una pantalla con comandos. Anotá la URL del repo (algo como `https://github.com/<tu-usuario>/precios-bimbo.git`).
4. Abrí una terminal en la carpeta del proyecto:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<tu-usuario>/precios-bimbo.git
   git push -u origin main
   ```

## 2) Habilitar GitHub Actions (automático)

GitHub detecta solo el archivo `.github/workflows/scrape.yml` y habilita el job.

Para verificar:
- Entrá al repo → tab "Actions" → debería aparecer "Scrape Bimbo Prices".
- Si te pide habilitar Actions, dale "I understand my workflows, go ahead and enable them".

Para correrlo manualmente la primera vez (no esperes las 12hs):
- Actions → "Scrape Bimbo Prices" → "Run workflow" → "Run workflow"
- Tarda ~5 min. Cuando termina, vas a ver un commit nuevo "chore: actualizar precios ..." en el repo.

## 3) Conectar Vercel

1. Ir a [vercel.com](https://vercel.com), crear cuenta (la opción más simple es loguearte con GitHub).
2. Dashboard → "Add New..." → "Project".
3. Seleccionar el repo `precios-bimbo` → "Import".
4. **Importante en la pantalla de config:**
   - Framework Preset: **Other**
   - Build Command: dejá vacío
   - Output Directory: **`public`**
   - Install Command: dejá vacío
5. Click "Deploy". Tarda ~30 segundos.
6. Vercel te da un link: `https://precios-bimbo-xxx.vercel.app` — ese es el que le pasás a tu compañero.

## 4) (Opcional) Dominio custom

Si querés algo más lindo tipo `precios-bimbo.tudominio.com`:
- Vercel → Project → Settings → Domains → Add.

## Cómo funciona después

- Cada 12hs (09:00 y 21:00 UY) GitHub Actions corre el scraping.
- Si hay cambios de precio, commitea los archivos nuevos.
- Vercel detecta el commit y redeployea la web automáticamente.
- Tu compañero entra al link cuando quiere y ve siempre la data más fresca.

## Trigger manual

Si necesitás datos en el momento:
- Repo en GitHub → Actions → "Scrape Bimbo Prices" → "Run workflow".
- A los 5 min la web está actualizada.

## Costo

- GitHub Actions: **gratis** (2000 min/mes en repos privados, ilimitado en públicos. Cada scrape tarda ~3 min → ~180 min/mes en el peor caso).
- Vercel: **gratis** en plan Hobby (suficiente para esto).

## Si algo falla

- **El Action falla**: entrá a Actions → click en el run rojo → ver logs. Probable causa: algún super cambió su HTML/API.
- **La web no actualiza**: chequeá que el commit del Action haya llegado al repo. Vercel redeployea solo si hubo push.
- **No hay datos en la web**: el Action no corrió todavía. Disparalo manualmente (ver "Trigger manual").
