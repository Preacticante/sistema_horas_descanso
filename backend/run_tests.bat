@echo off
REM Ejecuta pytest usando el Python portable incluido en el proyecto
SETLOCAL
SET PYTHON=%~dp0python_portable\python.exe
IF NOT EXIST "%PYTHON%" (
  echo No se encontro Python portable en %~dp0python_portable\python.exe
  echo Ejecuta: .\python_portable\python.exe -m pip install pytest
  exit /b 1
)
pushd %~dp0
"%PYTHON%" -m pytest tests -q
popd
ENDLOCAL
