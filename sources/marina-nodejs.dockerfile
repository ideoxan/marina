FROM ubuntu:latest

# Update Repos
RUN apt update -y
RUN apt upgrade -y
RUN apt install -y curl build-essential libssl-dev git

# Set up node
RUN curl -L https://deb.nodesource.com/setup_15.x | bash -
RUN apt install -y nodejs

# Adds a new low-level permission user to the system
RUN useradd -m -u 8877 -s /bin/bash user
USER user
ENV HOME /home/user
WORKDIR /home/user/

# Copies over a sample text file for the user to mess around with
COPY ./sample.txt ./README.txt