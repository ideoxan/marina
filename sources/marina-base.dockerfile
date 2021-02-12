FROM ubuntu:latest
RUN useradd -m -u 8877 -s /bin/bash ideoxan-user
USER ideoxan-user
WORKDIR /home/ideoxan-user/
COPY ./ideoxan.txt ./ideoxan.txt