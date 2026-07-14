local Blitbuffer = require("ffi/blitbuffer")
local ButtonTable = require("ui/widget/buttontable")
local BD = require("ui/bidi")
local CenterContainer = require("ui/widget/container/centercontainer")
local DataStorage = require("datastorage")
local Device = require("device")
local Font = require("ui/font")
local FrameContainer = require("ui/widget/container/framecontainer")
local Geom = require("ui/geometry")
local GestureRange = require("ui/gesturerange")
local HorizontalGroup = require("ui/widget/horizontalgroup")
local HorizontalSpan = require("ui/widget/horizontalspan")
local ImageWidget = require("ui/widget/imagewidget")
local InputContainer = require("ui/widget/container/inputcontainer")
local InputDialog = require("ui/widget/inputdialog")
local LeftContainer = require("ui/widget/container/leftcontainer")
local LineWidget = require("ui/widget/linewidget")
local MovableContainer = require("ui/widget/container/movablecontainer")
local NetworkMgr = require("ui/network/manager")
local Size = require("ui/size")
local TextWidget = require("ui/widget/textwidget")
local TextViewer = require("ui/widget/textviewer")
local TitleBar = require("ui/widget/titlebar")
local Trapper = require("ui/trapper")
local UIManager = require("ui/uimanager")
local VerticalGroup = require("ui/widget/verticalgroup")
local VerticalSpan = require("ui/widget/verticalspan")
local util = require("util")
local _ = require("gettext")
local plugin_dir = debug.getinfo(1, "S").source:match("^@(.+/)[^/]+$") or "./"
local Status = dofile(plugin_dir .. "../books_status.lua")

local Screen = Device.screen
local Requests = {}

local error_messages = {
    unauthorized = _("Authentication failed"),
    hardcover_not_configured = _("Hardcover is not configured for this account"),
    hardcover_unavailable = _("Hardcover is temporarily unavailable"),
    invalid_request = _("The request was invalid"),
    invalid_response = _("The server returned an invalid response"),
}
local function errorMessage(err) return _("Error: ") .. (error_messages[err] or tostring(err or _("Unknown error"))) end

local function post(config, path, body)
    local http, ltn12, mime = require("socket.http"), require("ltn12"), require("mime")
    local rapidjson, socket, socketutil = require("rapidjson"), require("socket"), require("socketutil")
    local encoded, sink = rapidjson.encode(body), {}
    socketutil:set_timeout(socketutil.LARGE_BLOCK_TIMEOUT, socketutil.LARGE_TOTAL_TIMEOUT)
    local code, _, status = socket.skip(1, http.request{
        url = config.requests_url .. path,
        method = "POST",
        source = ltn12.source.string(encoded),
        sink = socketutil.table_sink(sink),
        headers = {
            ["Authorization"] = "Basic " .. mime.b64(config.username .. ":" .. config.password),
            ["Content-Length"] = #encoded,
            ["Content-Type"] = "application/json",
        },
    })
    socketutil:reset_timeout()
    local response = table.concat(sink)
    local decoded, valid
    if response ~= "" then valid, decoded = pcall(rapidjson.decode, response) end
    if code ~= 200 then
        return nil, valid and type(decoded) == "table" and decoded.error or status or tostring(code), code
    end
    if valid == false or type(decoded) ~= "table" then return nil, "invalid_response", code end
    return decoded, nil, code
end

local function downloadCover(url, file)
    if type(url) ~= "string" or not url:match("^https://") then return nil end
    local lfs = require("libs/libkoreader-lfs")
    local attr = lfs.attributes(file)
    if attr and attr.size > 0 then return file end
    os.remove(file .. ".part")
    local handle = io.open(file .. ".part", "wb")
    if not handle then return nil end
    local bytes = 0
    local function sink(chunk)
        if chunk then
            bytes = bytes + #chunk
            if bytes > 5 * 1024 * 1024 then return nil, "cover too large" end
            return handle:write(chunk) and 1 or nil
        end
        return 1
    end
    local http, socket, socketutil = require("socket.http"), require("socket"), require("socketutil")
    socketutil:set_timeout(5, 20)
    local code = socket.skip(1, http.request{ url = url, method = "GET", sink = sink })
    socketutil:reset_timeout()
    handle:close()
    if code and code >= 200 and code < 300 and bytes > 0 and os.rename(file .. ".part", file) then return file end
    os.remove(file .. ".part")
end

local function search(config, query)
    local response, err, code = post(config, "/search", { query = query })
    if not response then return nil, err, code end
    if type(response.results) ~= "table" then return nil, "invalid_response", code end
    local results = response.results
    local cover_dir = DataStorage:getDataDir():gsub("/+$", "") .. "/cache/books-requests"
    util.makePath(cover_dir)
    for _, book in ipairs(results) do
        book.cover = downloadCover(book.cover_url, string.format("%s/%s.jpg", cover_dir, book.id))
    end
    return results
end

local function userCount(value)
    local count = tonumber(value) or 0
    if count >= 1000000 then return string.format("%.1fm", count / 1000000):gsub("%.0m", "m") end
    if count >= 1000 then return string.format("%.1fk", count / 1000):gsub("%.0k", "k") end
    return tostring(count)
end

local ResultRow = InputContainer:extend{}

function ResultRow:init()
    self.dimen = Geom:new{ x = 0, y = 0, w = self.width, h = self.height }
    self.ges_events.TapSelect = { GestureRange:new{ ges = "tap", range = self.dimen } }
    local cover_w, cover_h = Screen:scaleBySize(58), Screen:scaleBySize(80)
    local metadata_w, gap = Screen:scaleBySize(92), Screen:scaleBySize(8)
    local text_w = self.width - cover_w - metadata_w - 4 * gap
    local year = type(self.book.year) == "number" and string.format("(%s)", self.book.year) or nil
    local year_widget = year and TextWidget:new{
        text = year, face = Font:getFace("x_smallinfofont"), bold = true,
    } or nil
    local year_gap = year_widget and Screen:scaleBySize(4) or 0
    local title_widget = TextWidget:new{
        text = self.book.title, face = Font:getFace("x_smallinfofont"), bold = true,
        max_width = math.max(Screen:scaleBySize(40),
            text_w - (year_widget and year_widget:getSize().w or 0) - year_gap),
        truncate_with_ellipsis = true,
    }
    local title = year_widget and HorizontalGroup:new{
        align = "center", title_widget, HorizontalSpan:new{ width = year_gap }, year_widget,
    } or title_widget
    local author = TextWidget:new{
        text = self.book.author ~= "" and self.book.author or _("Unknown author"),
        face = Font:getFace("x_smallinfofont"), max_width = text_w,
    }
    local metadata = "★ " .. userCount(self.book.users_count)
    local cover = self.book.cover and ImageWidget:new{
        file = self.book.cover, width = cover_w, height = cover_h,
    } or CenterContainer:new{
        dimen = Geom:new{ w = cover_w, h = cover_h },
        VerticalSpan:new{ width = 0 },
    }
    local separator_h = Size.line.thin
    self[1] = VerticalGroup:new{
        align = "left",
        FrameContainer:new{
            width = self.width, height = self.height - separator_h, padding = gap,
            bordersize = 0, background = Blitbuffer.COLOR_WHITE,
            HorizontalGroup:new{
                align = "center",
                CenterContainer:new{
                    dimen = Geom:new{ w = cover_w, h = cover_h },
                    FrameContainer:new{
                        dimen = Geom:new{ w = cover_w, h = cover_h },
                        padding = 0, bordersize = Size.border.thin, cover,
                    },
                },
                HorizontalSpan:new{ width = gap },
                LeftContainer:new{
                    dimen = Geom:new{ w = text_w, h = self.height - 2 * gap },
                    VerticalGroup:new{ align = "left", title, author },
                },
                HorizontalSpan:new{ width = gap },
                CenterContainer:new{
                    dimen = Geom:new{ w = metadata_w, h = self.height - 2 * gap },
                    TextWidget:new{ text = metadata, face = Font:getFace("x_smallinfofont") },
                },
            },
        },
        LineWidget:new{
            background = Blitbuffer.COLOR_BLACK,
            dimen = Geom:new{ w = self.width, h = separator_h },
        },
    }
end

function ResultRow:onTapSelect()
    self.callback(self.book)
    return true
end

local ResultsDialog = InputContainer:extend{}

function ResultsDialog:init()
    if Device:hasKeys() then
        local back = util.tableDeepCopy(Device.input.group.Back)
        if Device:hasFewKeys() then table.insert(back, "Left") else table.insert(back, "Menu") end
        self.key_events.Close = { { back } }
    end
    if Device:isTouchDevice() then
        self.ges_events.TapClose = { GestureRange:new{
            ges = "tap", range = Geom:new{ x = 0, y = 0, w = Screen:getWidth(), h = Screen:getHeight() },
        } }
    end

    local border = Size.border.window
    local inner_w = self.width - 2 * border
    local title_bar = TitleBar:new{
        width = inner_w, title = string.format("%s · %d/%d", self.query, self.page, self.page_count),
        align = "center", with_bottom_line = true,
        close_callback = function() self:onClose() end,
    }
    local previous, next_page = "◁◁", "▷▷"
    if BD.mirroredUILayout() then previous, next_page = next_page, previous end
    local buttons = ButtonTable:new{
        width = inner_w, zero_sep = true, show_parent = self,
        buttons = {
            {
                { text = previous, enabled = self.page > 1, callback = function() self.on_page(self.page - 1) end },
                { text = next_page, enabled = self.page < self.page_count, callback = function() self.on_page(self.page + 1) end },
            },
            {{ text = _("New Search"), callback = self.on_new_search }},
        },
    }
    local rows = VerticalGroup:new{ align = "left" }
    local first = (self.page - 1) * self.page_size + 1
    local last = math.min(#self.results, first + self.page_size - 1)
    if #self.results == 0 then
        rows[1] = CenterContainer:new{
            dimen = Geom:new{ w = inner_w, h = self.row_height },
            TextWidget:new{ text = _("No results"), face = Font:getFace("smallinfofont") },
        }
    else
        for index = first, last do
            rows[#rows + 1] = ResultRow:new{
                book = self.results[index], width = inner_w, height = self.row_height,
                callback = self.on_select,
            }
        end
    end
    local content_h = self.height - 2 * border - title_bar:getHeight() - buttons:getSize().h
    local filler_h = math.max(0, content_h - rows:getSize().h)
    local frame = FrameContainer:new{
        radius = Size.radius.window, bordersize = border, padding = 0, margin = 0,
        background = Blitbuffer.COLOR_WHITE,
        VerticalGroup:new{
            align = "left", title_bar, rows,
            VerticalSpan:new{ width = filler_h },
            buttons,
        },
    }
    self.movable = MovableContainer:new{ frame }
    self[1] = CenterContainer:new{ dimen = Screen:getSize(), self.movable }
end

function ResultsDialog:onShow()
    UIManager:setDirty(self, function() return "ui", self.movable.dimen end)
end

function ResultsDialog:onCloseWidget()
    UIManager:setDirty(nil, function() return "flashui", self.movable.dimen end)
end

function ResultsDialog:onClose()
    UIManager:close(self)
    return true
end

function ResultsDialog:onTapClose(_, ges)
    if ges.pos:notIntersectWith(self.movable.dimen) then self:onClose() end
    return true
end

local function submit(owner, book)
    NetworkMgr:runWhenOnline(function()
        Trapper:wrap(function()
            local completed, response, err, code = Status.run(_("Submitting…"), function()
                return post(owner.config, "/submit", { book_id = book.id })
            end)
            if not completed then return end
            if response then
                Status.notice(_("Submitted successfully!"))
            elseif err == "already_in_library" then
                Status.notice(_("This book is already in your Hardcover library"))
            else
                Status.notice(errorMessage(err))
            end
        end)
    end)
end

local function confirm(owner, book)
    local title = type(book.year) == "number" and string.format("%s (%s)", book.title, book.year) or book.title
    local dialog
    dialog = TextViewer:new{
        title = _("Request?"),
        text = title .. "\n" .. (book.author or ""),
        width = math.floor(math.min(Screen:getWidth(), Screen:getHeight()) * 5 / 6),
        height = Screen:scaleBySize(220),
        show_menu = false,
        buttons_table = {{
            { text = _("Cancel"), callback = function() dialog:onClose() end },
            { text = _("Submit"), callback = function() dialog:onClose(); submit(owner, book) end },
        }},
    }
    UIManager:show(dialog)
end

local function showResults(owner, query, results, page)
    page = page or 1
    local row_px = Screen:scaleBySize(100)
    local modal_px = math.floor(Screen:getHeight() * 23 / 30)
    local page_size = math.max(1, math.floor((modal_px - Screen:scaleBySize(150)) / row_px))
    local page_count = math.max(1, math.ceil(#results / page_size))
    local dialog
    dialog = ResultsDialog:new{
        width = math.floor(math.min(Screen:getWidth(), Screen:getHeight()) * 5 / 6),
        height = modal_px, query = query, results = results, page = page,
        page_size = page_size, page_count = page_count, row_height = row_px,
        on_select = function(book) confirm(owner, book) end,
        on_page = function(next_page)
            UIManager:close(dialog)
            showResults(owner, query, results, next_page)
        end,
        on_new_search = function()
            UIManager:close(dialog)
            Requests.show(owner)
        end,
    }
    UIManager:show(dialog)
end

local function runSearch(owner, query)
    NetworkMgr:runWhenOnline(function()
        Trapper:wrap(function()
            local completed, results, err = Status.run(_("Searching…"), function()
                return search(owner.config, query)
            end)
            if not completed then return end
            if not results then Status.notice(errorMessage(err)); return end
            showResults(owner, query, results)
        end)
    end)
end

function Requests.show(owner)
    local dialog
    dialog = InputDialog:new{
        title = _("Request a book"), input_hint = _("Enter title or author"),
        buttons = {{
            { text = _("Cancel"), id = "close", callback = function() UIManager:close(dialog) end },
            { text = _("Search"), is_enter_default = true, callback = function()
                local query = dialog:getInputText():gsub("^%s+", ""):gsub("%s+$", "")
                if query == "" then Status.notice(_("Enter a title or author")); return end
                UIManager:close(dialog)
                runSearch(owner, query)
            end },
        }},
    }
    UIManager:show(dialog)
    dialog:onShowKeyboard()
end

return Requests
