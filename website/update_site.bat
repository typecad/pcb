npm run build
scp -r -i C:\Users\justi\OneDrive\Documents\ufire.pem .\build ubuntu@34.213.54.250:/home/ubuntu/build
ssh -i C:\Users\justi\OneDrive\Documents\ufire.pem ubuntu@34.213.54.250 '/home/ubuntu/update_site.sh'
