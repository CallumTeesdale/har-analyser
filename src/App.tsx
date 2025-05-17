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
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filterMethod, setFilterMethod] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    // Check if user has a preference stored
    const savedPreference = localStorage.getItem("darkMode");
    if (savedPreference !== null) {
      return savedPreference === "true";
    }
    // Otherwise check system preference
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  // Apply dark mode class to document
  React.useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    // Save preference to localStorage
    localStorage.setItem("darkMode", darkMode.toString());
  }, [darkMode]);

  // Function to toggle dark mode
  const toggleDarkMode = () => {
    setDarkMode(prev => !prev);
  };

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
      // Convert camelCase fields to snake_case for Rust backend
      const rustRequest = {
        ...request,
        http_version: request.httpVersion,
        query_string: request.queryString,
        post_data: request.postData ? {
          ...request.postData,
          mime_type: request.postData.mimeType,
          params: request.postData.params ? request.postData.params.map(param => ({
            ...param,
            file_name: param.fileName,
            content_type: param.contentType
          })) : undefined
        } : undefined,
        headers_size: request.headersSize,
        body_size: request.bodySize
      };

      // Remove the original camelCase fields to avoid duplicates
      delete (rustRequest as any).httpVersion;
      delete (rustRequest as any).queryString;
      if (rustRequest.post_data) {
        delete (rustRequest.post_data as any).mimeType;
        if (rustRequest.post_data.params) {
          rustRequest.post_data.params.forEach(param => {
            delete (param as any).fileName;
            delete (param as any).contentType;
          });
        }
      }
      delete (rustRequest as any).headersSize;
      delete (rustRequest as any).bodySize;

      const response = await invoke("replay_request", { request: rustRequest });
      setReplayResponse(JSON.parse(response as string));
    } catch (error) {
      console.error("Error replaying request:", error);
    }
  }

  // Function to format headers as a string
  function formatHeaders(headers: HarHeader[]): string {
    return headers.map(h => `${h.name}: ${h.value}`).join('\n');
  }

  // Function to export request/response data
  function exportRequestData(entry: HarEntry) {
    const exportData = {
      request: {
        method: entry.request.method,
        url: entry.request.url,
        httpVersion: entry.request.httpVersion,
        headers: entry.request.headers,
        queryString: entry.request.queryString,
        postData: entry.request.postData,
      },
      response: {
        status: entry.response.status,
        statusText: entry.response.statusText,
        httpVersion: entry.response.httpVersion,
        headers: entry.response.headers,
        content: entry.response.content,
      },
      timing: entry.timings,
      serverIPAddress: entry.serverIPAddress,
      startedDateTime: entry.startedDateTime,
      time: entry.time,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    // Create a filename based on the request
    let filename;
    try {
      const urlObj = new URL(entry.request.url);
      const host = urlObj.host.replace(/[^a-z0-9]/gi, '_');
      const path = urlObj.pathname.replace(/[^a-z0-9]/gi, '_');
      filename = `${entry.request.method}_${host}${path}.json`;
    } catch (e) {
      filename = `request_${Date.now()}.json`;
    }

    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="icon" 
            onClick={toggleDarkMode} 
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {darkMode ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            )}
          </Button>
          <Button onClick={openHarFile}>Open HAR File</Button>
        </div>
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
                <div className="space-y-2 mb-4">
                  <Input 
                    placeholder="Search requests..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="method-filter" className="text-xs">Method</Label>
                      <select 
                        id="method-filter"
                        className="w-full p-2 rounded border border-input bg-background text-sm"
                        value={filterMethod}
                        onChange={(e) => setFilterMethod(e.target.value)}
                      >
                        <option value="all">All Methods</option>
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="DELETE">DELETE</option>
                        <option value="PATCH">PATCH</option>
                        <option value="OPTIONS">OPTIONS</option>
                        <option value="HEAD">HEAD</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="status-filter" className="text-xs">Status</Label>
                      <select 
                        id="status-filter"
                        className="w-full p-2 rounded border border-input bg-background text-sm"
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                      >
                        <option value="all">All Status</option>
                        <option value="2xx">2xx Success</option>
                        <option value="3xx">3xx Redirection</option>
                        <option value="4xx">4xx Client Error</option>
                        <option value="5xx">5xx Server Error</option>
                      </select>
                    </div>
                  </div>
                </div>
                <ScrollArea className="h-[calc(100vh-280px)]">
                  {harFile.log.entries
                    .filter(entry => {
                      // Apply search term filter
                      if (searchTerm && !entry.request.url.toLowerCase().includes(searchTerm.toLowerCase()) && 
                          !entry.request.method.toLowerCase().includes(searchTerm.toLowerCase())) {
                        return false;
                      }

                      // Apply method filter
                      if (filterMethod !== "all" && entry.request.method !== filterMethod) {
                        return false;
                      }

                      // Apply status filter
                      if (filterStatus !== "all") {
                        const statusCode = entry.response.status;
                        if (filterStatus === "2xx" && (statusCode < 200 || statusCode >= 300)) return false;
                        if (filterStatus === "3xx" && (statusCode < 300 || statusCode >= 400)) return false;
                        if (filterStatus === "4xx" && (statusCode < 400 || statusCode >= 500)) return false;
                        if (filterStatus === "5xx" && (statusCode < 500 || statusCode >= 600)) return false;
                      }

                      return true;
                    })
                    .map((entry, index) => (
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
                                <Label htmlFor="httpVersion" className="text-right">HTTP Version</Label>
                                <Input 
                                  id="httpVersion" 
                                  value={editedRequest?.httpVersion || selectedEntry.request.httpVersion}
                                  onChange={(e) => setEditedRequest({
                                    ...(editedRequest || selectedEntry.request),
                                    httpVersion: e.target.value
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
                      <CardTitle className="flex justify-between">
                        <span>Response</span>
                        <Button 
                          variant="outline"
                          onClick={() => exportRequestData(selectedEntry)}
                          title="Export request/response data as JSON"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                          </svg>
                          Export
                        </Button>
                      </CardTitle>
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
              <Tabs defaultValue="summary">
                <TabsList className="mb-4">
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                  <TabsTrigger value="details">Details</TabsTrigger>
                </TabsList>

                <TabsContent value="summary">
                  <Card>
                    <CardHeader>
                      <CardTitle>HAR File Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Basic Statistics */}
                        <div className="space-y-4">
                          <h3 className="text-lg font-semibold">Basic Statistics</h3>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="font-medium">Total Requests:</div>
                            <div>{harFile.log.entries.length}</div>

                            <div className="font-medium">Total Size:</div>
                            <div>{(harFile.log.entries.reduce((sum, entry) => sum + entry.response.bodySize, 0) / 1024).toFixed(2)} KB</div>

                            <div className="font-medium">Average Response Time:</div>
                            <div>{(harFile.log.entries.reduce((sum, entry) => sum + entry.time, 0) / harFile.log.entries.length).toFixed(2)} ms</div>

                            <div className="font-medium">Slowest Request:</div>
                            <div>
                              {(() => {
                                const slowest = harFile.log.entries.reduce((prev, current) => 
                                  (prev.time > current.time) ? prev : current);
                                try {
                                  return `${slowest.request.method} ${new URL(slowest.request.url).pathname} (${slowest.time.toFixed(2)} ms)`;
                                } catch (e) {
                                  return `${slowest.request.method} ${slowest.request.url} (${slowest.time.toFixed(2)} ms)`;
                                }
                              })()}
                            </div>
                          </div>
                        </div>

                        {/* Method Distribution */}
                        <div className="space-y-4">
                          <h3 className="text-lg font-semibold">HTTP Methods</h3>
                          {(() => {
                            const methodCounts = harFile.log.entries.reduce((acc, entry) => {
                              acc[entry.request.method] = (acc[entry.request.method] || 0) + 1;
                              return acc;
                            }, {} as Record<string, number>);

                            return Object.entries(methodCounts).map(([method, count]) => (
                              <div key={method} className="space-y-1">
                                <div className="flex justify-between">
                                  <span className="font-medium">{method}</span>
                                  <span>{count} ({((count / harFile.log.entries.length) * 100).toFixed(1)}%)</span>
                                </div>
                                <div className="h-2 bg-secondary/20 rounded-full">
                                  <div 
                                    className="h-full bg-primary rounded-full" 
                                    style={{ width: `${(count / harFile.log.entries.length) * 100}%` }}
                                  />
                                </div>
                              </div>
                            ));
                          })()}
                        </div>

                        {/* Status Code Distribution */}
                        <div className="space-y-4">
                          <h3 className="text-lg font-semibold">Status Codes</h3>
                          {(() => {
                            const statusGroups = {
                              "2xx Success": 0,
                              "3xx Redirection": 0,
                              "4xx Client Error": 0,
                              "5xx Server Error": 0,
                              "Other": 0
                            };

                            harFile.log.entries.forEach(entry => {
                              const status = entry.response.status;
                              if (status >= 200 && status < 300) statusGroups["2xx Success"]++;
                              else if (status >= 300 && status < 400) statusGroups["3xx Redirection"]++;
                              else if (status >= 400 && status < 500) statusGroups["4xx Client Error"]++;
                              else if (status >= 500 && status < 600) statusGroups["5xx Server Error"]++;
                              else statusGroups["Other"]++;
                            });

                            return Object.entries(statusGroups)
                              .filter(([_, count]) => count > 0)
                              .map(([group, count]) => (
                                <div key={group} className="space-y-1">
                                  <div className="flex justify-between">
                                    <span className="font-medium">{group}</span>
                                    <span>{count} ({((count / harFile.log.entries.length) * 100).toFixed(1)}%)</span>
                                  </div>
                                  <div className="h-2 bg-secondary/20 rounded-full">
                                    <div 
                                      className={`h-full rounded-full ${
                                        group === "2xx Success" ? "bg-green-500" :
                                        group === "3xx Redirection" ? "bg-blue-500" :
                                        group === "4xx Client Error" ? "bg-yellow-500" :
                                        group === "5xx Server Error" ? "bg-red-500" : "bg-gray-500"
                                      }`}
                                      style={{ width: `${(count / harFile.log.entries.length) * 100}%` }}
                                    />
                                  </div>
                                </div>
                            ));
                          })()}
                        </div>

                        {/* Content Type Distribution */}
                        <div className="space-y-4">
                          <h3 className="text-lg font-semibold">Content Types</h3>
                          {(() => {
                            const contentTypes = harFile.log.entries.reduce((acc, entry) => {
                              const mimeType = entry.response.content.mimeType.split(';')[0].trim();
                              const type = mimeType.includes('/') 
                                ? mimeType.split('/')[1] 
                                : mimeType;

                              acc[type] = (acc[type] || 0) + 1;
                              return acc;
                            }, {} as Record<string, number>);

                            return Object.entries(contentTypes)
                              .sort((a, b) => b[1] - a[1])
                              .slice(0, 5)
                              .map(([type, count]) => (
                                <div key={type} className="space-y-1">
                                  <div className="flex justify-between">
                                    <span className="font-medium">{type || 'unknown'}</span>
                                    <span>{count} ({((count / harFile.log.entries.length) * 100).toFixed(1)}%)</span>
                                  </div>
                                  <div className="h-2 bg-secondary/20 rounded-full">
                                    <div 
                                      className="h-full bg-purple-500 rounded-full" 
                                      style={{ width: `${(count / harFile.log.entries.length) * 100}%` }}
                                    />
                                  </div>
                                </div>
                            ));
                          })()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="details">
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center p-10">
                      <p className="text-center text-muted-foreground mb-4">
                        Select a request from the list to view details
                      </p>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
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
