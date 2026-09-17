using System;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace TimeViewScreensaver
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.SetHighDpiMode(HighDpiMode.SystemAware);

            string mode = args.Length > 0 ? args[0].ToLowerInvariant() : "/s";
            switch (mode)
            {
                case "/c":   // 配置
                    MessageBox.Show("时间景观 · 桌面屏保\n地球表盘 · 月相 · 节气 · 星空 · 实时时钟\n\n无需额外配置。",
                        "时间景观屏保", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                case "/p":   // 预览（嵌入控制面板的小窗口）
                    if (args.Length > 1 && long.TryParse(args[1], out long hwnd) && hwnd != 0)
                        Application.Run(new ScreensaverForm(new IntPtr(hwnd)));
                    return;
                case "/a":   // 密码，忽略
                    return;
                default:     // /s 或双击运行
                    Application.Run(new ScreensaverForm(IntPtr.Zero));
                    return;
            }
        }
    }

    class ScreensaverForm : Form
    {
        private const string DEFAULT_URL = "https://timeview.site/timeview/app?scrsv=1";

        private readonly WebView2 webView = new WebView2();
        private readonly IntPtr previewHwnd;
        private Timer _timer;
        private Point _basePos;
        private DateTime _startTime;

        public ScreensaverForm(IntPtr preview)
        {
            previewHwnd = preview;
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            BackColor = System.Drawing.Color.Black;
            webView.Dock = DockStyle.Fill;
            Controls.Add(webView);
            Load += OnLoad;
        }

        private async void OnLoad(object sender, EventArgs e)
        {
            try
            {
                string url = ReadUrl();
                string userData = Path.Combine(Path.GetTempPath(), "timeview_scr_webview");
                var env = await CoreWebView2Environment.CreateAsync(null, userData);
                await webView.EnsureCoreWebView2Async(env);
                webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                webView.CoreWebView2.Navigate(url);
            }
            catch
            {
                // WebView2 运行时缺失等异常：仍显示纯黑屏，避免崩溃
            }
        }

        // 显示内容优先级：同目录 url.txt（自定义网页）> 同目录 screensaver.html（本地渲染）> 默认域名下的应用页
        private static string ReadUrl()
        {
            string cfg = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "url.txt");
            if (File.Exists(cfg))
            {
                string v = File.ReadAllText(cfg).Trim();
                if (v.StartsWith("http://") || v.StartsWith("https://")) return v;
            }
            string sidecar = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "screensaver.html");
            if (File.Exists(sidecar)) return new Uri("file:///" + sidecar.Replace('\\', '/')).AbsoluteUri;
            return DEFAULT_URL;
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            if (previewHwnd != IntPtr.Zero)
            {
                Native.SetParent(this.Handle, previewHwnd);
                return;
            }
            Bounds = Screen.PrimaryScreen.Bounds;
            Cursor.Hide();
            TopMost = true;
            // 用定时器全局检测鼠标/键盘——WebView2 会吞掉窗体自身的事件，不能靠 OnMouseMove/OnKeyDown
            _basePos = Cursor.Position;
            _startTime = DateTime.Now;
            _timer = new Timer { Interval = 30 };
            _timer.Tick += (s, ev) => CheckExit();
            _timer.Start();
        }

        private void CheckExit()
        {
            // 前 400ms 忽略，避免屏保刚启动时光标抖动导致误退
            if ((DateTime.Now - _startTime).TotalMilliseconds < 400) return;
            Point p = Cursor.Position;
            if (Math.Abs(p.X - _basePos.X) > 4 || Math.Abs(p.Y - _basePos.Y) > 4) { Close(); return; }
            // 任意键 / 鼠标键按下即退出
            for (int vk = 0x01; vk <= 0xFE; vk++)
                if ((Native.GetAsyncKeyState(vk) & 0x8000) != 0) { Close(); return; }
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            if (_timer != null) { _timer.Stop(); _timer.Dispose(); _timer = null; }
            Cursor.Show();
            base.OnFormClosed(e);
        }
    }

    static class Native
    {
        [DllImport("user32.dll", SetLastError = true)]
        public static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);

        [DllImport("user32.dll")]
        public static extern short GetAsyncKeyState(int vKey);
    }
}
