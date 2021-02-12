# Uses the latest stable version of Ubuntu (no GUI)
FROM ubuntu:latest

# Adds a new low-level permission user to the system
RUN useradd -m -u 8877 -s /bin/bash user
USER user
WORKDIR /home/user/

# Copies over a sample text file for the user to mess around with
COPY ./sample.txt ./README.txt