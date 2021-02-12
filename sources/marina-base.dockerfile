FROM ubuntu:latest
RUN useradd -m -u 8877 -s /bin/bash user
USER user
WORKDIR /home/user/
COPY ./sample.txt ./README.txt