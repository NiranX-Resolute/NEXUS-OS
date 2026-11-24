using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Diagnostics;
using System.Threading;
using System.Windows.Forms;

namespace NexusScholar
{
    class Program
    {
        private static HttpListener _listener;
        private static string _frontendPath;
        private static int _port;
        private static Process _browserProcess;

        [STAThread]
        static void Main(string[] args)
        {
            try
            {
                string exeDir = AppDomain.CurrentDomain.BaseDirectory;
                string candidate1 = Path.Combine(exeDir, "frontend");
                string candidate2 = Path.Combine(exeDir, "..", "frontend");
                string candidate3 = Path.Combine(exeDir, "..", "..", "nexus-scholar", "frontend");

                if (Directory.Exists(candidate1)) _frontendPath = Path.GetFullPath(candidate1);
                else if (Directory.Exists(candidate2)) _frontendPath = Path.GetFullPath(candidate2);
                else if (Directory.Exists(candidate3)) _frontendPath = Path.GetFullPath(candidate3);
                else _frontendPath = exeDir;

                _port = GetFreePort(8793);

                _listener = new HttpListener();
                _listener.Prefixes.Add(string.Format("http://127.0.0.1:{0}/", _port));
                _listener.Prefixes.Add(string.Format("http://localhost:{0}/", _port));
                _listener.Start();

                Thread serverThread = new Thread(RunServer);
                serverThread.IsBackground = true;
                serverThread.Start();

                string appUrl = string.Format("http://127.0.0.1:{0}/index.html", _port);
                LaunchNativeAppWindow(appUrl);

                if (_browserProcess != null)
                {
                    _browserProcess.WaitForExit();
                }
                else
                {
                    Application.Run();
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Nexus Scholar Error: " + ex.Message, "Nexus Scholar", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                try { if (_listener != null) _listener.Stop(); } catch { }
            }
        }

        private static int GetFreePort(int defaultPort)
        {
            try
            {
                TcpListener l = new TcpListener(IPAddress.Loopback, defaultPort);
                l.Start();
                int port = ((IPEndPoint)l.LocalEndpoint).Port;
                l.Stop();
                return port;
            }
            catch
            {
                TcpListener l = new TcpListener(IPAddress.Loopback, 0);
                l.Start();
                int port = ((IPEndPoint)l.LocalEndpoint).Port;
                l.Stop();
                return port;
            }
        }

        private static void LaunchNativeAppWindow(string url)
        {
            string edgePath64 = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
            string edgePath = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe";
            string browserPath = File.Exists(edgePath64) ? edgePath64 : (File.Exists(edgePath) ? edgePath : null);

            if (browserPath != null)
            {
                string args = string.Format("--app=\"{0}\" --window-size=1280,840 --enable-features=WebGazer,WebAudio --autoplay-policy=no-user-gesture-required --user-data-dir=\"{1}\"",
                    url, Path.Combine(Path.GetTempPath(), "NexusScholarUser"));
                ProcessStartInfo psi = new ProcessStartInfo(browserPath, args);
                psi.UseShellExecute = false;
                _browserProcess = Process.Start(psi);
            }
            else
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
        }

        private static void RunServer()
        {
            while (_listener.IsListening)
            {
                try
                {
                    var context = _listener.GetContext();
                    ThreadPool.QueueUserWorkItem(delegate(object c) {
                        ProcessRequest((HttpListenerContext)c);
                    }, context);
                }
                catch
                {
                    break;
                }
            }
        }

        private static void ProcessRequest(HttpListenerContext context)
        {
            HttpListenerRequest req = context.Request;
            HttpListenerResponse res = context.Response;

            res.AddHeader("Access-Control-Allow-Origin", "*");
            res.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            res.AddHeader("Access-Control-Allow-Headers", "Content-Type, X-Custom-Key, Authorization");

            if (req.HttpMethod == "OPTIONS")
            {
                res.StatusCode = 204;
                res.Close();
                return;
            }

            string rawUrl = req.Url.AbsolutePath.TrimStart('/');
            if (string.IsNullOrEmpty(rawUrl) || rawUrl == "/") rawUrl = "index.html";

            if (rawUrl.StartsWith("api/"))
            {
                HandleApi(rawUrl, req, res);
                return;
            }

            string filePath = Path.Combine(_frontendPath, rawUrl.Replace('/', Path.DirectorySeparatorChar));
            if (File.Exists(filePath))
            {
                try
                {
                    byte[] bytes = File.ReadAllBytes(filePath);
                    res.ContentType = GetMimeType(filePath);
                    res.ContentLength64 = bytes.Length;
                    res.OutputStream.Write(bytes, 0, bytes.Length);
                    res.StatusCode = 200;
                }
                catch (Exception ex)
                {
                    res.StatusCode = 500;
                    byte[] err = Encoding.UTF8.GetBytes(ex.Message);
                    res.OutputStream.Write(err, 0, err.Length);
                }
            }
            else
            {
                res.StatusCode = 404;
                byte[] notFound = Encoding.UTF8.GetBytes("File Not Found: " + rawUrl);
                res.OutputStream.Write(notFound, 0, notFound.Length);
            }

            res.Close();
        }

        private static void HandleApi(string endpoint, HttpListenerRequest req, HttpListenerResponse res)
        {
            res.ContentType = "application/json";
            string jsonResponse = "{}";

            if (endpoint.Contains("sonify"))
            {
                jsonResponse = "{\"success\":true,\"data\":{\"high_level_summary\":\"A visual scientific diagram illustrating system components.\",\"granular_breakdown\":[\"Primary nodes establish baseline conditions.\",\"Intermediate pathways demonstrate sequential dependency.\"],\"exam_takeaway\":\"Master regulatory feedback mechanisms for exams.\",\"audio_walkthrough_text\":\"This scientific diagram illustrates system components with regulatory feedback loops.\"}}";
            }
            else if (endpoint.Contains("tutor"))
            {
                jsonResponse = "{\"success\":true,\"response\":{\"tutor_speech\":\"Great question! Let's explore how energy transfer powers cellular function through the Socratic method.\",\"key_concept\":\"Energy Transfer\",\"follow_up_question\":\"What is the primary rate-limiting step?\"},\"quiz\":{\"question\":\"Which organelle generates cellular ATP?\",\"options\":[{\"letter\":\"A\",\"text\":\"Nucleus\",\"icon\":\"🧬\",\"is_correct\":false},{\"letter\":\"B\",\"text\":\"Mitochondria\",\"icon\":\"⚡\",\"is_correct\":true},{\"letter\":\"C\",\"text\":\"Ribosome\",\"icon\":\"🧱\",\"is_correct\":false},{\"letter\":\"D\",\"text\":\"Golgi\",\"icon\":\"📦\",\"is_correct\":false}],\"explanation\":\"Mitochondria conduct oxidative phosphorylation.\"}}";
            }
            else if (endpoint.Contains("flashcards"))
            {
                jsonResponse = "{\"success\":true,\"cards\":[{\"id\":\"fc1\",\"question\":\"Where does glycolysis occur?\",\"answer\":\"In the cytoplasm.\",\"box_level\":1},{\"id\":\"fc2\",\"question\":\"What enzyme drives ATP synthesis?\",\"answer\":\"ATP Synthase.\",\"box_level\":2}]}";
            }
            else if (endpoint.Contains("documents"))
            {
                jsonResponse = "{\"success\":true,\"chunks\":[{\"section_title\":\"Core Concept 1\",\"concept_summary\":\"Primary foundational principle.\",\"audio_walkthrough_text\":\"Audio summary for concept 1.\"}]}";
            }
            else
            {
                jsonResponse = "{\"success\":true,\"message\":\"Local Nexus Scholar Edge API Online.\"}";
            }

            byte[] b = Encoding.UTF8.GetBytes(jsonResponse);
            res.ContentLength64 = b.Length;
            res.OutputStream.Write(b, 0, b.Length);
            res.Close();
        }

        private static string GetMimeType(string path)
        {
            string ext = Path.GetExtension(path).ToLower();
            switch (ext)
            {
                case ".html": return "text/html; charset=utf-8";
                case ".js": return "application/javascript; charset=utf-8";
                case ".css": return "text/css; charset=utf-8";
                case ".json": return "application/json; charset=utf-8";
                case ".png": return "image/png";
                case ".jpg":
                case ".jpeg": return "image/jpeg";
                case ".svg": return "image/svg+xml";
                case ".ico": return "image/x-icon";
                default: return "application/octet-stream";
            }
        }
    }
}
