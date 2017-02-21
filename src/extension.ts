'use strict';

import * as path from 'path';

import * as child_process from 'child_process';

import { workspace, Disposable, ExtensionContext, languages, window } from 'vscode';
import { LanguageClient, LanguageClientOptions, SettingMonitor, ServerOptions, TransportKind } from 'vscode-languageclient';

let DEV_MODE = true;

let spinnerTimers = [];
let nextBuildTask = 0;

class Counter {
    count: number;

    constructor() {
        this.count = 0;
    }

    increment() {
        this.count += 1;
    }

    decrementAndGet() {
        this.count -= 1;
        if (this.count < 0) {
            this.count = 0;
        }
        return this.count;
    }
}

export function activate(context: ExtensionContext) {
    let serverOptions: ServerOptions;

    let rls_root = process.env.RLS_ROOT;
    window.setStatusBarMessage("RLS analysis: starting up");

    if (DEV_MODE) {
        if (rls_root) {
            serverOptions = {command: "cargo", args: ["run", "--release"], options: { cwd: rls_root } };
        } else {
            serverOptions = {command: "rls"};
        }
    } else {
        serverOptions = () => new Promise<child_process.ChildProcess>((resolve, reject) => {
            function spawnServer(...args: string[]): child_process.ChildProcess {
                let childProcess;
                if (rls_root) {
                    childProcess = child_process.spawn("cargo", ["run", "--release"], { cwd: rls_root });
                } else {
                    childProcess = child_process.spawn("rls");
                }
                childProcess.stderr.on('data', data => {});
                return childProcess; // Uses stdin/stdout for communication
            }

            resolve(spawnServer())
        });
    }

    // Options to control the language client
    let clientOptions: LanguageClientOptions = {
        // Register the server for Rust files
        documentSelector: ['rust'],
        synchronize: {
            // Synchronize the setting section 'languageServerExample' to the server
            configurationSection: 'languageServerExample',
            // Notify the server about changes to files contained in the workspace
            //fileEvents: workspace.createFileSystemWatcher('**/*.*')
        }
    }

    // Create the language client and start the client.
    let lc = new LanguageClient('Rust Language Server', serverOptions, clientOptions);

    let runningDiagnostics = new Counter();
    lc.onNotification({method: "rustDocument/diagnosticsBegin"}, function(f) {
        runningDiagnostics.increment();
        let state = 0;
        spinnerTimers.push(setInterval(function() {
            if (state == 0) {
                window.setStatusBarMessage("RLS analysis: working |");
                state = 1;
            }
            else if (state == 1) {
                window.setStatusBarMessage("RLS analysis: working /");
                state = 2;
            }
            else if (state == 2) {
                window.setStatusBarMessage("RLS analysis: working -");
                state = 3;
            }
            else if (state == 3) {
                window.setStatusBarMessage("RLS analysis: working \\");
                state = 0;
            }
        }, 100));
    })
    lc.onNotification({method: "rustDocument/diagnosticsEnd"}, function(f) {
        while (spinnerTimers.length > 0) {
            let spinnerTimer = spinnerTimers.pop();
            clearInterval(spinnerTimer);
        }
        let count = runningDiagnostics.decrementAndGet()
        if (count == 0) {
            window.setStatusBarMessage("RLS analysis: done");
        }
    })
    let disposable = lc.start();

    // Push the disposable to the context's subscriptions so that the
    // client can be deactivated on extension deactivation
    context.subscriptions.push(disposable);
}
