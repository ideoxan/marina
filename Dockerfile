FROM ubuntu:latest
RUN useradd -m -u 8877 -s /bin/bash ideoxan-user
USER ideoxan-user
CMD ["/bin/bash"]
