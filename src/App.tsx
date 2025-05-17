import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { open } from "@tauri-apps/api/dialog";
import { readTextFile } from "@tauri-apps/api/fs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Button } from "./components/ui/button";
import { ScrollArea } from "./components/ui/scroll-area";
import { Separator } from "./components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Define TypeScript interfaces for HAR file structure
interface HarFile {
  log: HarLog;
}

interface HarLog {
  version: string;
  creator: HarCreator;
  browser?: HarBrowser;
  pages?: HarPage[];
  entries: HarEntry[];
}

interface HarCreator {
  name: string;
  version: string;
}

interface HarBrowser {
  name: string;
  version: string;
}

interface HarPage {
  id: string;
  title: string;
  startedDateTime: string;
}

interface HarEntry {
  startedDateTime: string;
  time: number;
  request: HarRequest;
  response: HarResponse;
  cache: HarCache;
  timings: HarTimings;
  serverIPAddress?: string;
  connection?: string;
}

interface HarRequest {
  method: string;
  url: string;
  httpVersion: string;
  cookies: HarCookie[];
  headers: HarHeader[];
  queryString: HarQueryString[];
  postData?: HarPostData;
  headersSize: number;
  bodySize: number;
}

interface HarResponse {
  status: number;
  statusText: string;
  httpVersion: string;
  cookies: HarCookie[];
  headers: HarHeader[];
  content: HarContent;
  redirectURL: string;
  headersSize: number;
  bodySize: number;
}

interface HarCookie {
  name: string;
  value: string;
}

interface HarHeader {
  name: string;
  value: string;
}

interface HarQueryString {
  name: string;
  value: string;
}

interface HarPostData {
  mimeType: string;
  text?: string;
  params?: HarParam[];
}

interface HarParam {
  name: string;
  value?: string;
  fileName?: string;
  contentType?: string;
}

interface HarContent {
  size: number;
  mimeType: string;
  text?: string;
  encoding?: string;
}

interface HarCache {
  beforeRequest?: HarCacheState;
  afterRequest?: HarCacheState;
}

interface HarCacheState {
  expires?: string;
  lastAccess: string;
  eTag: string;
  hitCount: number;
}

interface HarTimings {
  blocked: number;
  dns: number;
  connect: number;
  send: number;
  wait: number;
  receive: number;
  ssl: number;
}

function App() {
  const [harFile, setHarFile] = useState<HarFile | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<HarEntry | null>(null);
  const [editedRequest, setEditedRequest] = useState<HarRequest | null>(null);
  const [replayResponse, setReplayResponse] = useState<any>(null);

  // Function to open and load a HAR file
  async function openHarFile() {
    try {
      // Open file dialog to select a HAR file
      const selected = await open({
        multiple: false,
        filters: [{ name: 'HAR Files', extensions: ['har'] }]
      });

      if (selected && !Array.isArray(selected)) {
        // Read the file content
        const content = await readTextFile(selected);
        const harData = JSON.parse(content) as HarFile;
        setHarFile(harData);

        // Reset selected entry and other state
        setSelectedEntry(null);
        setEditedRequest(null);
        setReplayResponse(null);
      }
    } catch (error) {
      console.error("Error opening HAR file:", error);
    }
  }

  // Function to replay a request
  async function replayRequest(request: HarRequest) {
    try {
      const response = await invoke("replay_request", { request });
      setReplayResponse(JSON.parse(response as string));
    } catch (error) {
      console.error("Error replaying request:", error);
    }
  }

  // Function to format headers as a string
  function formatHeaders(headers: HarHeader[]): string {
    return headers.map(h => `${h.name}: ${h.value}`).join('\n');
  }

  // Function to determine content type and format accordingly
  function formatContent(content: HarContent): JSX.Element {
    if (!content.text) {
      return <div>No content</div>;
    }

    let language = 'text';
    let text = content.text;

    // Try to parse JSON
    if (content.mimeType.includes('json')) {
      try {
        const parsed = JSON.parse(content.text);
        text = JSON.stringify(parsed, null, 2);
        language = 'json';
      } catch (e) {
        // Not valid JSON, keep as text
      }
    } else if (content.mimeType.includes('html')) {
      language = 'html';
    } else if (content.mimeType.includes('javascript')) {
      language = 'javascript';
    } else if (content.mimeType.includes('css')) {
      language = 'css';
    } else if (content.mimeType.includes('xml')) {
      language = 'xml';
    }

    return (
      <SyntaxHighlighter language={language} style={vscDarkPlus}>
        {text}
      </SyntaxHighlighter>
    );
  }

  // Calculate total time for waterfall chart
  const maxTime = harFile?.log.entries.reduce((max, entry) => 
    Math.max(max, entry.time), 0) || 0;

  return (
    <div className="container mx-auto p-4">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">HAR Analyser</h1>
        <Button onClick={openHarFile}>Open HAR File</Button>
      </header>

      {harFile ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Left sidebar - Request list */}
          <div className="md:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Requests ({harFile.log.entries.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[calc(100vh-200px)]">
                  {harFile.log.entries.map((entry, index) => (
                    <div 
                      key={index}
                      className={`p-2 mb-2 cursor-pointer rounded ${selectedEntry === entry ? 'bg-primary/10' : 'hover:bg-secondary/10'}`}
                      onClick={() => {
                        setSelectedEntry(entry);
                        setEditedRequest(null);
                        setReplayResponse(null);
                      }}
                    >
                      <div className="font-medium">{entry.request.method} {(() => {
                        try {
                          return new URL(entry.request.url).pathname;
                        } catch (e) {
                          console.error("Invalid URL:", entry.request.url);
                          return entry.request.url;
                        }
                      })()}</div>
                      <div className="text-sm text-muted-foreground">{(() => {
                        try {
                          return new URL(entry.request.url).host;
                        } catch (e) {
                          console.error("Invalid URL:", entry.request.url);
                          return "unknown host";
                        }
                      })()}</div>
                      <div className="text-xs text-muted-foreground">
                        Status: {entry.response.status} | Time: {entry.time ? entry.time.toFixed(2) : '0'}ms
                      </div>

                      {/* Waterfall bar */}
                      <div className="mt-2 h-2 bg-secondary/20 rounded-full">
                        <div 
                          className="h-full bg-primary rounded-full" 
                          style={{ width: `${entry.time && maxTime ? (entry.time / maxTime) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Main content area */}
          <div className="md:col-span-2">
            {selectedEntry ? (
              <Tabs defaultValue="request">
                <TabsList className="mb-4">
                  <TabsTrigger value="request">Request</TabsTrigger>
                  <TabsTrigger value="response">Response</TabsTrigger>
                  <TabsTrigger value="timing">Timing</TabsTrigger>
                </TabsList>

                {/* Request Tab */}
                <TabsContent value="request">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex justify-between">
                        <span>{selectedEntry.request.method} {(() => {
                          try {
                            return new URL(selectedEntry.request.url).pathname;
                          } catch (e) {
                            console.error("Invalid URL:", selectedEntry.request.url);
                            return selectedEntry.request.url;
                          }
                        })()}</span>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button>Replay Request</Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-[800px]">
                            <DialogHeader>
                              <DialogTitle>Edit and Replay Request</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                              <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="method" className="text-right">Method</Label>
                                <Input 
                                  id="method" 
                                  value={editedRequest?.method || selectedEntry.request.method}
                                  onChange={(e) => setEditedRequest({
                                    ...(editedRequest || selectedEntry.request),
                                    method: e.target.value
                                  })}
                                  className="col-span-3"
                                />
                              </div>
                              <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="url" className="text-right">URL</Label>
                                <Input 
                                  id="url" 
                                  value={editedRequest?.url || selectedEntry.request.url}
                                  onChange={(e) => setEditedRequest({
                                    ...(editedRequest || selectedEntry.request),
                                    url: e.target.value
                                  })}
                                  className="col-span-3"
                                />
                              </div>
                              <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="headers" className="text-right">Headers</Label>
                                <textarea 
                                  id="headers" 
                                  value={editedRequest?.headers 
                                    ? formatHeaders(editedRequest.headers)
                                    : formatHeaders(selectedEntry.request.headers)
                                  }
                                  onChange={(e) => {
                                    const headerLines = e.target.value.split('\n');
                                    const headers = headerLines.map(line => {
                                      const [name, ...valueParts] = line.split(':');
                                      const value = valueParts.join(':').trim();
                                      return { name, value };
                                    });
                                    setEditedRequest({
                                      ...(editedRequest || selectedEntry.request),
                                      headers
                                    });
                                  }}
                                  className="col-span-3 min-h-[100px] p-2 border rounded"
                                />
                              </div>
                              <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="body" className="text-right">Body</Label>
                                <textarea 
                                  id="body" 
                                  value={editedRequest?.postData?.text || selectedEntry.request.postData?.text || ''}
                                  onChange={(e) => {
                                    const postData = {
                                      ...(editedRequest?.postData || selectedEntry.request.postData || { mimeType: 'application/json' }),
                                      text: e.target.value
                                    };
                                    setEditedRequest({
                                      ...(editedRequest || selectedEntry.request),
                                      postData
                                    });
                                  }}
                                  className="col-span-3 min-h-[150px] p-2 border rounded"
                                />
                              </div>
                            </div>
                            <div className="flex justify-end">
                              <Button onClick={() => replayRequest(editedRequest || selectedEntry.request)}>
                                Send Request
                              </Button>
                            </div>

                            {replayResponse && (
                              <div className="mt-4">
                                <h3 className="font-bold mb-2">Response</h3>
                                <div className="p-2 bg-secondary/10 rounded">
                                  <div>Status: {replayResponse.status}</div>
                                  <Accordion type="single" collapsible>
                                    <AccordionItem value="headers">
                                      <AccordionTrigger>Headers</AccordionTrigger>
                                      <AccordionContent>
                                        <pre className="text-xs">{JSON.stringify(replayResponse.headers, null, 2)}</pre>
                                      </AccordionContent>
                                    </AccordionItem>
                                    <AccordionItem value="body">
                                      <AccordionTrigger>Body</AccordionTrigger>
                                      <AccordionContent>
                                        <SyntaxHighlighter language="json" style={vscDarkPlus}>
                                          {replayResponse.body}
                                        </SyntaxHighlighter>
                                      </AccordionContent>
                                    </AccordionItem>
                                  </Accordion>
                                </div>
                              </div>
                            )}
                          </DialogContent>
                        </Dialog>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-4">
                        <h3 className="font-bold mb-2">General</h3>
                        <div className="grid grid-cols-2 gap-2">
                          <div>URL:</div>
                          <div className="font-mono text-sm break-all">{selectedEntry.request.url}</div>
                          <div>Method:</div>
                          <div>{selectedEntry.request.method}</div>
                          <div>HTTP Version:</div>
                          <div>{selectedEntry.request.httpVersion}</div>
                        </div>
                      </div>

                      <Separator className="my-4" />

                      <Accordion type="single" collapsible>
                        <AccordionItem value="headers">
                          <AccordionTrigger>Headers ({selectedEntry.request.headers.length})</AccordionTrigger>
                          <AccordionContent>
                            <div className="grid grid-cols-2 gap-2">
                              {selectedEntry.request.headers.map((header, i) => (
                                <React.Fragment key={i}>
                                  <div className="font-medium">{header.name}</div>
                                  <div className="font-mono text-sm break-all">{header.value}</div>
                                </React.Fragment>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>

                        {selectedEntry.request.queryString.length > 0 && (
                          <AccordionItem value="query">
                            <AccordionTrigger>Query Parameters ({selectedEntry.request.queryString.length})</AccordionTrigger>
                            <AccordionContent>
                              <div className="grid grid-cols-2 gap-2">
                                {selectedEntry.request.queryString.map((param, i) => (
                                  <React.Fragment key={i}>
                                    <div className="font-medium">{param.name}</div>
                                    <div className="font-mono text-sm break-all">{param.value}</div>
                                  </React.Fragment>
                                ))}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        )}

                        {selectedEntry.request.postData && (
                          <AccordionItem value="body">
                            <AccordionTrigger>Body</AccordionTrigger>
                            <AccordionContent>
                              <div className="mb-2">
                                <span className="font-medium">Content Type: </span>
                                <span>{selectedEntry.request.postData.mimeType}</span>
                              </div>
                              {selectedEntry.request.postData.text && (
                                <SyntaxHighlighter 
                                  language={selectedEntry.request.postData.mimeType.includes('json') ? 'json' : 'text'} 
                                  style={vscDarkPlus}
                                >
                                  {selectedEntry.request.postData.text}
                                </SyntaxHighlighter>
                              )}
                              {selectedEntry.request.postData.params && (
                                <div className="grid grid-cols-2 gap-2">
                                  {selectedEntry.request.postData.params.map((param, i) => (
                                    <React.Fragment key={i}>
                                      <div className="font-medium">{param.name}</div>
                                      <div className="font-mono text-sm break-all">{param.value || param.fileName}</div>
                                    </React.Fragment>
                                  ))}
                                </div>
                              )}
                            </AccordionContent>
                          </AccordionItem>
                        )}
                      </Accordion>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Response Tab */}
                <TabsContent value="response">
                  <Card>
                    <CardHeader>
                      <CardTitle>Response</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-4">
                        <h3 className="font-bold mb-2">General</h3>
                        <div className="grid grid-cols-2 gap-2">
                          <div>Status:</div>
                          <div>{selectedEntry.response.status} {selectedEntry.response.statusText}</div>
                          <div>HTTP Version:</div>
                          <div>{selectedEntry.response.httpVersion}</div>
                          <div>Size:</div>
                          <div>{selectedEntry.response.bodySize} bytes</div>
                          <div>MIME Type:</div>
                          <div>{selectedEntry.response.content.mimeType}</div>
                        </div>
                      </div>

                      <Separator className="my-4" />

                      <Accordion type="single" collapsible>
                        <AccordionItem value="headers">
                          <AccordionTrigger>Headers ({selectedEntry.response.headers.length})</AccordionTrigger>
                          <AccordionContent>
                            <div className="grid grid-cols-2 gap-2">
                              {selectedEntry.response.headers.map((header, i) => (
                                <React.Fragment key={i}>
                                  <div className="font-medium">{header.name}</div>
                                  <div className="font-mono text-sm break-all">{header.value}</div>
                                </React.Fragment>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="content">
                          <AccordionTrigger>Content</AccordionTrigger>
                          <AccordionContent>
                            {formatContent(selectedEntry.response.content)}
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Timing Tab */}
                <TabsContent value="timing">
                  <Card>
                    <CardHeader>
                      <CardTitle>Timing Waterfall</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="grid grid-cols-[150px_1fr] gap-2">
                          <div className="font-medium">Blocked</div>
                          <div className="relative h-6 bg-secondary/20 rounded-full">
                            <div 
                              className="absolute h-full bg-yellow-500 rounded-full" 
                              style={{ width: `${selectedEntry.timings.blocked && selectedEntry.time ? (selectedEntry.timings.blocked / selectedEntry.time) * 100 : 0}%` }}
                            />
                            <span className="absolute right-2 text-xs leading-6">
                              {selectedEntry.timings.blocked ? selectedEntry.timings.blocked.toFixed(2) : '0'}ms
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-[150px_1fr] gap-2">
                          <div className="font-medium">DNS</div>
                          <div className="relative h-6 bg-secondary/20 rounded-full">
                            <div 
                              className="absolute h-full bg-green-500 rounded-full" 
                              style={{ width: `${selectedEntry.timings.dns && selectedEntry.time ? (selectedEntry.timings.dns / selectedEntry.time) * 100 : 0}%` }}
                            />
                            <span className="absolute right-2 text-xs leading-6">
                              {selectedEntry.timings.dns ? selectedEntry.timings.dns.toFixed(2) : '0'}ms
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-[150px_1fr] gap-2">
                          <div className="font-medium">Connect</div>
                          <div className="relative h-6 bg-secondary/20 rounded-full">
                            <div 
                              className="absolute h-full bg-blue-500 rounded-full" 
                              style={{ width: `${selectedEntry.timings.connect && selectedEntry.time ? (selectedEntry.timings.connect / selectedEntry.time) * 100 : 0}%` }}
                            />
                            <span className="absolute right-2 text-xs leading-6">
                              {selectedEntry.timings.connect ? selectedEntry.timings.connect.toFixed(2) : '0'}ms
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-[150px_1fr] gap-2">
                          <div className="font-medium">SSL</div>
                          <div className="relative h-6 bg-secondary/20 rounded-full">
                            <div 
                              className="absolute h-full bg-purple-500 rounded-full" 
                              style={{ width: `${selectedEntry.timings.ssl && selectedEntry.time ? (selectedEntry.timings.ssl / selectedEntry.time) * 100 : 0}%` }}
                            />
                            <span className="absolute right-2 text-xs leading-6">
                              {selectedEntry.timings.ssl ? selectedEntry.timings.ssl.toFixed(2) : '0'}ms
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-[150px_1fr] gap-2">
                          <div className="font-medium">Send</div>
                          <div className="relative h-6 bg-secondary/20 rounded-full">
                            <div 
                              className="absolute h-full bg-orange-500 rounded-full" 
                              style={{ width: `${selectedEntry.timings.send && selectedEntry.time ? (selectedEntry.timings.send / selectedEntry.time) * 100 : 0}%` }}
                            />
                            <span className="absolute right-2 text-xs leading-6">
                              {selectedEntry.timings.send ? selectedEntry.timings.send.toFixed(2) : '0'}ms
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-[150px_1fr] gap-2">
                          <div className="font-medium">Wait</div>
                          <div className="relative h-6 bg-secondary/20 rounded-full">
                            <div 
                              className="absolute h-full bg-red-500 rounded-full" 
                              style={{ width: `${selectedEntry.timings.wait && selectedEntry.time ? (selectedEntry.timings.wait / selectedEntry.time) * 100 : 0}%` }}
                            />
                            <span className="absolute right-2 text-xs leading-6">
                              {selectedEntry.timings.wait ? selectedEntry.timings.wait.toFixed(2) : '0'}ms
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-[150px_1fr] gap-2">
                          <div className="font-medium">Receive</div>
                          <div className="relative h-6 bg-secondary/20 rounded-full">
                            <div 
                              className="absolute h-full bg-pink-500 rounded-full" 
                              style={{ width: `${selectedEntry.timings.receive && selectedEntry.time ? (selectedEntry.timings.receive / selectedEntry.time) * 100 : 0}%` }}
                            />
                            <span className="absolute right-2 text-xs leading-6">
                              {selectedEntry.timings.receive ? selectedEntry.timings.receive.toFixed(2) : '0'}ms
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-[150px_1fr] gap-2">
                          <div className="font-medium">Total</div>
                          <div className="relative h-6 bg-secondary/20 rounded-full">
                            <div 
                              className="absolute h-full bg-primary rounded-full" 
                              style={{ width: '100%' }}
                            />
                            <span className="absolute right-2 text-xs leading-6">
                              {selectedEntry.time ? selectedEntry.time.toFixed(2) : '0'}ms
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center p-10">
                  <p className="text-center text-muted-foreground mb-4">
                    Select a request from the list to view details
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-10">
            <h2 className="text-xl font-semibold mb-2">No HAR File Loaded</h2>
            <p className="text-center text-muted-foreground mb-4">
              Open a HAR file to analyze network requests and responses
            </p>
            <Button onClick={openHarFile}>Open HAR File</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default App;
