@echo off
if "%TYPECAD_DEPLOY_KEY%"=="" (echo Set TYPECAD_DEPLOY_KEY and TYPECAD_DEPLOY_HOST first & exit /b 1)
npm run build
scp -r -i "%TYPECAD_DEPLOY_KEY%" .\build %TYPECAD_DEPLOY_HOST%:/home/ubuntu/build
ssh -i "%TYPECAD_DEPLOY_KEY%" %TYPECAD_DEPLOY_HOST% '/home/ubuntu/update_site.sh'
