# Uses the latest stable version of Ubuntu (no GUI)
FROM ubuntu:latest

# Adds a new low-level permission user to the system
RUN useradd -m -u 8877 -s /bin/bash user
USER user
WORKDIR /home/user/

# Add color to terminal prompt
RUN sed -i '46 s/#//' ~/.bashrc
RUN echo '[[ -s "$HOME/.rvm/scripts/rvm" ]] && source "$HOME/.rvm/scripts/rvm"' >> ~/.bashrc
RUN ls -la
RUN . ~/.bashrc

# Copies over a sample text file for the user to mess around with
COPY ./sample.txt ./README.txt