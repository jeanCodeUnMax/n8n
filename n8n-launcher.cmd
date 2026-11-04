@echo off
rem Launcher n8n en fenetre visible — pointe par N8N_NODE.
rem L'extension spawn: n8n-launcher.cmd <bin> start -> ouvre une console visible.
start "n8n" /D "C:\data-sys\n8n" cmd /k "node %*"
