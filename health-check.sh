#!/bin/bash

# In the original repository we'll just print the result of status checks,
# without committing. This avoids generating several commits that would make
# later upstream merges messy for anyone who forked us.
commit=true
origin=$(git remote get-url origin)
if [[ $origin == *statsig-io/statuspage* ]]
then
  commit=false
fi

KEYSARRAY=()
URLSARRAY=()
METHODSARRAY=()
ENVARRAY=()
TYPESARRAY=()

urlsConfig="./config.json"

echo "Reading $urlsConfig"

echo "Generating json from $urlsConfig"

config=$(cat $urlsConfig)


for row in $(echo "${config}" | jq -r '.[] | @base64'); do
  _jq() {
    echo ${row} | base64 --decode | jq -r ${1}
  }
   url=$(echo $(_jq '.url'))
   key=$(echo $(_jq '.key'))
   method=$(echo $(_jq '.method'))
   env=$(echo $(_jq '.env'))
   type=$(echo $(_jq '.type'))
   KEYSARRAY+=(${key})
   URLSARRAY+=(${url})
   METHODSARRAY+=(${method})
   ENVARRAY+=(${env})
   TYPESARRAY+=(${type})
done

echo "***********************"
echo "Starting health checks with ${#KEYSARRAY[@]} configs:"

mkdir -p "logs/production/api"
mkdir -p "logs/production/web"
mkdir -p "logs/sandbox/api"
mkdir -p "logs/sandbox/web"

for (( index=0; index < ${#KEYSARRAY[@]}; index++))
do
  key="${KEYSARRAY[index]}"
  url="${URLSARRAY[index]}"
  method="${METHODSARRAY[index]}"
  env="${ENVARRAY[index]}"
  type="${TYPESARRAY[index]}"

  echo "  $key=$url=$method"

  for i in 1 2 3 4; 
  do
    response=$(curl -w "%{http_code}" -X ${method} --silent $url --header "Content-Type:application/json")
    httpStatus=$(printf "%s" "$response" | tail -c 3)
    if [ "$type" = "api" ]; then
      resStatus=$(echo ${response::-3} | jq -r '.status')
    fi

    if [[ ( "$httpStatus" -eq 200 ) || ( "$httpStatus" -eq 202 ) || ( "$httpStatus" -eq 301 ) || ( "$httpStatus" -eq 302 ) || ( "$httpStatus" -eq 307 ) && ("$type" -eq "api" && "$resStatus" -eq "pass") ]]; then
      result="success"
    else
      result="failed"
    fi
    if [ "$result" = "success" ]; then
      break
    else
      curl -X POST -H 'Content-type: application/json' -s --data '{"text":"SERVICE DOWN ALERT","blocks":[{"type":"section","block_id":"section567","text":{"type":"mrkdwn","text":"<https://pallafinancial.github.io/statuspage|Status Page> \nService '$key' is currently experiencing downtime."},"accessory":{"type":"image","image_url":"https://pbs.twimg.com/media/E7liAZbWQAchl5u.jpg","alt_text":"STONE COLD WITH THE FOLDING CHAIR"}}]}' $SLACK_WEBHOOK_URL
      break
    fi
    sleep 5
  done
  dateTime=$(date +'%Y-%m-%d %H:%M')
  if [[ $commit == true ]]
  then
    echo $dateTime, $result >> "logs/${env}/${type}/${key}_report.log"
    # By default we keep 2000 last log entries.  Feel free to modify this to meet your needs.
    echo "$(tail -2000 logs/${env}/${type}/${key}_report.log)" > "logs/${env}/${type}/${key}_report.log"
  else
    echo "    $dateTime, $result"
  fi
done

if [[ $commit == true ]]
then
  git config --global user.name $GIT_USER_NAME
  git config --global user.email $GIT_USER_EMAIL
  git add -A --force logs/
  git commit -am '[Automated] Update Health Check Logs'
  git push
fi
