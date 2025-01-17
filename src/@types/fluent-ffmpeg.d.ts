declare module 'fluent-ffmpeg' {
    function ffmpeg(input?: string): FfmpegCommand;
  
    interface FfmpegCommand {
      /**
       * Sets the output format for the command.
       * @param format - The desired output format (e.g., 'mp3', 'mp4').
       */
      toFormat(format: string): this;
  
      /**
       * Adds an event listener for the specified event.
       * @param event - The event type ('end' or 'error').
       * @param callback - The callback function to handle the event.
       */
      on(event: 'end', callback: () => void): this;
      on(event: 'error', callback: (err: Error) => void): this;
  
      /**
       * Specifies the output file path and starts processing.
       * @param output - The path to save the output file.
       */
      save(output: string): this;
    }
  
    export = ffmpeg;
  }
  