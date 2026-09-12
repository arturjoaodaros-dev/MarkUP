@echo off
setlocal enabledelayedexpansion
title MarkUP

set "ROOT=%~dp0"
set "DESKTOP=%ROOT%packages\desktop"

rem O Cargo costuma nao estar no PATH de sessoes nao interativas no Windows
rem mesmo quando ja instalado -- garante que "tauri dev" (que chama cargo
rem por baixo) encontra o binario sem precisar configurar nada a mais.
where cargo >nul 2>nul
if errorlevel 1 (
    if exist "%USERPROFILE%\.cargo\bin\cargo.exe" (
        set "PATH=%PATH%;%USERPROFILE%\.cargo\bin"
    ) else (
        echo [MarkUP] Rust/Cargo nao encontrado. Instale em https://rustup.rs antes de continuar.
        pause
        exit /b 1
    )
)

if not exist "%ROOT%node_modules" (
    echo [MarkUP] Dependencias do projeto ainda nao instaladas. Rodando "npm install"...
    call npm install --prefix "%ROOT%"
    if errorlevel 1 (
        echo [MarkUP] Falha ao instalar dependencias.
        pause
        exit /b 1
    )
)

echo [MarkUP] Iniciando o aplicativo...
cd /d "%DESKTOP%"
call npm run tauri -- dev

if errorlevel 1 (
    echo.
    echo [MarkUP] O aplicativo encerrou com erro. Veja as mensagens acima.
    pause
)

endlocal
