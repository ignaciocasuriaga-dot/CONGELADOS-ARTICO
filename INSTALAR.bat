@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Instalando Precios Bimbo

echo ============================================
echo   INSTALACION - Precios Bimbo Uruguay
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [X] Node.js NO esta instalado.
    echo.
    echo Por favor instala Node.js antes de continuar:
    echo   https://nodejs.org
    echo.
    echo Bajate la version "LTS", instala con todas las opciones
    echo por defecto, REINICIA la computadora, y volve a correr
    echo este archivo.
    echo.
    pause
    exit /b 1
)

echo [1/2] Instalando dependencias de la app...
echo       Esto tarda 1-2 minutos la primera vez.
echo.
call npm install
if errorlevel 1 goto error

echo.
echo [2/2] Descargando el navegador para scraping...
echo       Pesa ~120 MB, tarda 2-5 minutos segun tu conexion.
echo.
call npx playwright install chromium
if errorlevel 1 goto error

echo.
echo ============================================
echo   LISTO - Instalacion completa
echo ============================================
echo.
echo Ahora podes hacer doble click en EJECUTAR.bat
echo cuando quieras relevar precios.
echo.
pause
exit /b 0

:error
echo.
echo ============================================
echo   ERROR en la instalacion
echo ============================================
echo.
echo Algo fallo. Revisa el mensaje de arriba.
echo Si no entendes que pasa, mostrale esta pantalla a alguien.
echo.
pause
exit /b 1
