FROM node:23.7.0-slim
WORKDIR /usr/src/app
#WORKDIR /sandbox
#COPY requirements.txt .
#RUN apt-get update || : && apt-get install python3-venv -y || : && apt-get install rsync -y || : && apt-get install cloc -y
#RUN apt-get update || : && apt-get install rsync -y || : && apt-get install cloc -y
#RUN python3 -m venv /opt/venv
#ENV PATH="/opt/venv/bin:$PATH"
#ENV PATH="/sandbox:$PATH"
#RUN python3 -m pip install -r requirements.txt
#COPY --from=python_stage /opt/venv /opt/venv

#ENV PATH="/opt/venv/bin:$PATH"
ENV NODE_ENV=container

# Install Node.js dependencies
#RUN npm init --yes
COPY package-docker.json package.json
#COPY fuzzUtils .
RUN npm install
