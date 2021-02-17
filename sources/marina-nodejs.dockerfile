FROM ubuntu:latest

ENV USERNAME user

# Update Repos
RUN apt update -y
RUN apt upgrade -y

# Set up node
RUN curl -L https://deb.nodesource.com/setup_15.x | bash -
RUN apt install -y nodejs

# Adds a new low-level permission user to the system
RUN useradd -m -u 8877 --create-home -s /bin/bash ${USERNAME} 
USER ${USERNAME}
WORKDIR /home/${USERNAME}

# Copies over a sample text file for the user to mess around with
COPY ./sample.txt ./README.txt