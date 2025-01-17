declare module 'fluent-ffmpeg' {
    function ffmpeg(input?: string): FfmpegCommand;
    interface FfmpegCommand {
        toFormat(format: string): this;
        on(event: 'end' | 'error', callback: (err?: any) => void): this;
        save(output: string): this;
    }
    export = ffmpeg;
} 