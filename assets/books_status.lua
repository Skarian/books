local InfoMessage = require("ui/widget/infomessage")
local Trapper = require("ui/trapper")
local UIManager = require("ui/uimanager")

local Status = {}

function Status.notice(text)
    UIManager:show(InfoMessage:new{ text = text, timeout = 4 })
end

function Status.run(text, task)
    local info = InfoMessage:new{ text = text }
    UIManager:show(info)
    UIManager:forceRePaint()
    local result = table.pack(Trapper:dismissableRunInSubprocess(task, info))
    if result[1] then UIManager:close(info) end
    return unpack(result, 1, result.n)
end

return Status
