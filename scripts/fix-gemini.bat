@echo off
chcp 65001 >nul
title Настройка доступа к Google Gemini (GhosterNet)

:: Проверка прав администратора и авто-повышение
fltmc >nul 2>&1
if errorlevel 1 (
    echo [i] Запрашиваем права Администратора...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo ========================================================
echo       Настройка доступа к Google Gemini и AI Studio     
echo ========================================================
echo.

set "HOSTS_FILE=%SystemRoot%\System32\drivers\etc\hosts"
set "SAFE_DATE=%date%"
set "SAFE_DATE=%SAFE_DATE:/=%"
set "SAFE_DATE=%SAFE_DATE:.=%"
set "SAFE_DATE=%SAFE_DATE: =%"
set "BACKUP_FILE=%SystemRoot%\System32\drivers\etc\hosts.bak_%SAFE_DATE%_%RANDOM%"

if not exist "%HOSTS_FILE%" (
    echo [!] Файл hosts не найден по пути %HOSTS_FILE%!
    pause
    exit /b 1
)

:: Бэкап
copy /y "%HOSTS_FILE%" "%BACKUP_FILE%" >nul
echo [+] Создана резервная копия: %BACKUP_FILE%

:: Проверяем, есть ли уже записи 132.243.112.221
findstr /C:"132.243.112.221" "%HOSTS_FILE%" >nul
if %errorlevel% equ 0 (
    echo [*] Рабочий IP 132.243.112.221 уже присутствует в файле hosts.
) else (
    echo [+] Добавляем рабочие адреса для Google Gemini...
    >>"%HOSTS_FILE%" (
        echo.
        echo # ============================================================
        echo # AI Unlock Block — доступ к Google Gemini и AI Studio
        echo # Проверено GhosterNet
        echo # ============================================================
        echo 132.243.112.221 gemini.google.com
        echo 132.243.112.221 aistudio.google.com
        echo 132.243.112.221 generativelanguage.googleapis.com
        echo 132.243.112.221 labs.google.com
        echo 132.243.112.221 labs.google
        echo 132.243.112.221 notebooklm.google.com
        echo 132.243.112.221 jules.google.com
        echo 132.243.112.221 stitch.withgoogle.com
        echo 132.243.112.221 aisandbox-pa.googleapis.com
        echo 132.243.112.221 aitestkitchen.withgoogle.com
        echo 132.243.112.221 alkalimakersuite-pa.clients6.google.com
        echo 132.243.112.221 assistant-s3-pa.googleapis.com
        echo 132.243.112.221 proactivebackend-pa.googleapis.com
        echo 132.243.112.221 robinfrontend-pa.googleapis.com
        echo 132.243.112.221 webchannel-alkalimakersuite-pa.clients6.google.com
        echo 132.243.112.221 o.pki.goog
        echo # ============================================================
    )
    echo [+] Записи успешно добавлены в hosts!
)

:: Сброс DNS кэша
echo [+] Сбрасываем кэш DNS Windows...
ipconfig /flushdns >nul

echo.
echo ========================================================
echo [ГОТОВО] Настройки успешно применены!
echo.
echo ВАЖНО ДЛЯ БРАУЗЕРА (Chrome / Edge / Яндекс):
echo 1. Отключите "Безопасный DNS" в браузере:
echo    Настройки -^> Конфиденциальность -^> Безопасность -^>
echo    выключите "Использовать безопасный DNS" (чтобы браузер
echo    не отправлял запросы мимо системного hosts).
echo 2. Перезапустите браузер (или откройте gemini.google.com
echo    в режиме Инкогнито, чтобы сбросились старые сокеты).
echo ========================================================
echo.
pause
