## Run comfy from command line

To run the `comfy` service using Docker without Docker Compose, you can use the `docker run` command. Based on the configuration in the Docker Compose file, the command would look like this:

```bash
docker run -it --rm -p 7860:7860 -v $(pwd)/data:/data -v $(pwd)/output:/output -v $(pwd)/models:/models --stop-signal=SIGINT --name comfy comfy:latest
```

Here's the breakdown of the command:

- `docker run`: The main command to run a Docker container.
- `-it`: Allocates a pseudo-TTY and keeps STDIN open for interactive processes.
- `--rm`: Removes the container automatically when it exits.
- `-p 7860:7860`: Publishes the container's port 7860 to the host's port 7860.
- `-v $(pwd)/data:/data`: Mounts the `./data` directory from the host to the `/data` directory in the container.
- `-v $(pwd)/output:/output`: Mounts the `./output` directory from the host to the `/output` directory in the container.
- `--stop-signal=SIGINT`: Sets the stop signal for the container to SIGINT.
- `--name comfy`: Names the container "comfy".
- `--env CLI_ARGS=`: Sets the environment variable `CLI_ARGS` to an empty value.
- `sd-comfy:2`: Specifies the Docker image to use, which is "sd-comfy:2".

Make sure to replace `$(pwd)` with the appropriate path to the `data` and `output` directories if you are not running the command from the same directory as the Docker Compose file.