FROM node:latest

ENV USERNAME user

# Update Repos
RUN apt-get update -y
RUN apt-get upgrade -y

# Adds a new low-level permission user to the system
RUN useradd -m -u 8877 --create-home -s /bin/bash ${USERNAME} 
USER ${USERNAME}
WORKDIR /home/${USERNAME}

# Copies over a sample text file for the user to mess around with
COPY ./sample.txt ./README.txt