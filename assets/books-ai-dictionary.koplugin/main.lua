local DataStorage = require("datastorage")
local InfoMessage = require("ui/widget/infomessage")
local JSON = require("json")
local LuaSettings = require("luasettings")
local NetworkMgr = require("ui/network/manager")
local Trapper = require("ui/trapper")
local UIManager = require("ui/uimanager")
local InputContainer = require("ui/widget/container/inputcontainer")
local _ = require("gettext")

local BooksAIDictionary = InputContainer:new{
    name = "books_ai_dictionary",
}

local function clean(value, max)
    local text = tostring(value or ""):gsub("%s+", " "):gsub("^%s+", ""):gsub("%s+$", "")
    if max and #text > max then text = text:sub(1, max) end
    return text
end

local function cleanLines(value, max)
    local text = tostring(value or ""):gsub("\r\n", "\n"):gsub("\r", "\n")
    text = text:gsub("[ \t]+", " "):gsub("\n%s+", "\n"):gsub("^%s+", ""):gsub("%s+$", "")
    text = text:gsub("\n+", "\n")
    if max and #text > max then text = text:sub(1, max) end
    return text
end

local function html(value)
    return cleanLines(value, 2000):gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;")
end

local function withoutTrailingPeriod(value)
    return cleanLines(value, 500):gsub("%s*%.$", "")
end

local function htmlDefinition(entry)
    local lines = { "<i>" .. html(entry.label or "term") .. "</i>" }
    for i, definition in ipairs(entry.definitions or {}) do
        table.insert(lines, tostring(i) .. ". " .. html(withoutTrailingPeriod(definition)))
    end
    return table.concat(lines, "<br/>")
end

local function notify(text)
    UIManager:show(InfoMessage:new{ text = text, timeout = 3 })
end

local function request(endpoint, username, password, body)
    local http = require("socket.http")
    local ltn12 = require("ltn12")
    local socket = require("socket")
    local socketutil = require("socketutil")
    local sink = {}
    socketutil:set_timeout(15, 75)
    local code, _, status = socket.skip(1, http.request{
        url = endpoint,
        method = "POST",
        headers = {
            ["Authorization"] = "Basic " .. require("ffi/sha2").bin_to_base64(username .. ":" .. password),
            ["Content-Type"] = "application/json",
            ["Content-Length"] = string.len(body),
        },
        source = ltn12.source.string(body),
        sink = socketutil.table_sink(sink),
    })
    socketutil:reset_timeout()
    if code ~= 200 then return false, status or "Lookup failed." end
    local ok, result = pcall(JSON.decode, table.concat(sink))
    if not (ok and result and type(result.label) == "string" and type(result.definitions) == "table" and type(result.definitions[1]) == "string") then
        return false, "Lookup response was invalid."
    end
    return true, htmlDefinition(result)
end

function BooksAIDictionary:init()
    if not (self.ui and self.ui.highlight) then return end
    self.ui.highlight:addToHighlightDialog("aidictionary_3", function(highlight, index)
        return {
            text = _("AI Dictionary"),
            callback = function()
                self:lookup(highlight, index)
            end,
        }
    end)
end

function BooksAIDictionary:booksServer()
    local settings = LuaSettings:open(DataStorage:getSettingsDir() .. "/opds.lua")
    for _, server in ipairs(settings:readSetting("servers", {})) do
        local url = type(server.url) == "string" and server.url or ""
        local endpoint = url:gsub("/catalog/$", "/ai-dictionary/lookup"):gsub("/catalog$", "/ai-dictionary/lookup")
        if endpoint ~= url and server.username and server.password then
            return endpoint, server.username, server.password
        end
    end
end

function BooksAIDictionary:book()
    local props = self.ui.doc_props or {}
    local title = clean(props.display_title or props.title or _("Unknown book"), 160)
    local authors = props.authors
    if type(authors) == "table" then authors = table.concat(authors, ", ") end
    authors = clean(authors, 80)
    return authors ~= "" and (title .. " by " .. authors) or title
end

function BooksAIDictionary:chapter()
    if not (self.ui.toc and self.ui.getCurrentPage) then return "" end
    local ok, chapter = pcall(self.ui.toc.getTocTitleByPage, self.ui.toc, self.ui:getCurrentPage())
    return ok and clean(chapter, 160) or ""
end

function BooksAIDictionary:progress()
    local pct = self.ui.doc_settings and self.ui.doc_settings:readSetting("percent_finished")
    if type(pct) == "number" then
        return string.format("about %d%% through the book", math.floor(pct * 100 + 0.5))
    end
    if not self.ui.document then return "" end
    local ok_page, page = pcall(self.ui.getCurrentPage, self.ui)
    local ok_count, count = pcall(self.ui.document.getPageCount, self.ui.document)
    if ok_page and ok_count and page and count then
        return string.format("page %s of %s through the book", page, count)
    end
    return ""
end

function BooksAIDictionary:wordBoxes(highlight, index)
    local selected = highlight.selected_text
    local boxes = index and highlight:getHighlightVisibleBoxes(index) or (selected.sboxes or selected.pboxes)
    if not boxes then return end
    local word_boxes = {}
    for i, box in ipairs(boxes) do
        word_boxes[i] = highlight.view:pageToScreenTransform(selected.pos0.page, box)
    end
    return word_boxes
end

function BooksAIDictionary:snapshot(highlight, index)
    highlight:highlightFromHoldPos()
    local selected = highlight.selected_text
    local selection = selected and clean(selected.text, 500) or ""
    if selection == "" then return end
    local prev, next = highlight:getSelectedWordContext(40)
    return {
        book = self:book(),
        chapter = self:chapter(),
        progress = self:progress(),
        selection = selection,
        passage = clean(table.concat({ prev or "", selection, next or "" }, " "), 1800),
        boxes = self:wordBoxes(highlight, index),
    }
end

function BooksAIDictionary:snapshotDictionaryPopup(dict_popup)
    local selection = clean(dict_popup.word or dict_popup.lookupword, 500)
    if selection == "" then return end
    local passage = selection
    local highlight = dict_popup.highlight
    if highlight and highlight.getSelectedWordContext then
        local ok, prev, next = pcall(highlight.getSelectedWordContext, highlight, 40)
        if ok then
            passage = clean(table.concat({ prev or "", selection, next or "" }, " "), 1800)
        end
    end
    return {
        book = self:book(),
        chapter = self:chapter(),
        progress = self:progress(),
        selection = selection,
        passage = passage,
        boxes = dict_popup.word_boxes,
    }
end

function BooksAIDictionary:onDictButtonsReady(dict_popup, buttons)
    if dict_popup.is_wiki then return end
    if dict_popup.results and dict_popup.results[1] and dict_popup.results[1].dict == _("AI Dictionary") then return end
    for _, row in ipairs(buttons or {}) do
        for _, button in ipairs(row) do
            if button.id == "books_ai_dictionary" then return end
        end
    end
    if #buttons > 1 then
        table.insert(buttons, 2, {
            {
                id = "books_ai_dictionary",
                text = _("AI Dictionary"),
                font_bold = true,
                callback = function()
                    self:lookupDictionaryPopup(dict_popup)
                end,
            },
        })
    end
end

function BooksAIDictionary:lookup(highlight, index)
    local payload = self:snapshot(highlight, index)
    highlight:onClose(true)
    if not payload then return notify(_("No text selected.")) end
    if NetworkMgr:willRerunWhenOnline(function() Trapper:wrap(function() self:startLookup(payload) end) end) then return end
    Trapper:wrap(function() self:startLookup(payload) end)
end

function BooksAIDictionary:lookupDictionaryPopup(dict_popup)
    local payload = self:snapshotDictionaryPopup(dict_popup)
    dict_popup:onClose(true)
    if not payload then return notify(_("No text selected.")) end
    if NetworkMgr:willRerunWhenOnline(function() Trapper:wrap(function() self:startLookup(payload) end) end) then return end
    Trapper:wrap(function() self:startLookup(payload) end)
end

function BooksAIDictionary:body(payload)
    return JSON.encode{
        book = payload.book,
        chapter = payload.chapter,
        progress = payload.progress,
        selection = payload.selection,
        passage = payload.passage,
    }
end

function BooksAIDictionary:startLookup(payload)
    local endpoint, username, password = self:booksServer()
    if not endpoint then return notify(_("Books OPDS account was not found.")) end
    local body = self:body(payload)
    local info = InfoMessage:new{ text = _("Looking up AI Dictionary...") }
    UIManager:show(info)
    UIManager:forceRePaint()
    local completed, ok, definition = Trapper:dismissableRunInSubprocess(function()
        return request(endpoint, username, password, body)
    end, info)
    if completed then
        UIManager:close(info)
    end
    if not completed then return end
    if not ok then return notify(definition) end
    self.ui.dictionary:showDict(payload.selection, {
        { dict = _("AI Dictionary"), word = payload.selection, definition = definition, is_html = true },
    }, payload.boxes)
end

return BooksAIDictionary
